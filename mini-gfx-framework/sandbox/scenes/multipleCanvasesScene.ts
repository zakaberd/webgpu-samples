import { mat4 } from 'wgpu-matrix';

import { defaultDeviceHostFactory } from '../../src';
import { quitIfWebGPUNotAvailable } from '../util';
import { modelData } from './multipleCanvases/models';
import type { SandboxScene, SceneCleanup } from './types';

type TypedArrayView = Float32Array | Uint32Array;

interface GpuModel {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexFormat: GPUIndexFormat;
  vertexCount: number;
}

interface CanvasInfo {
  context: GPUCanvasContext;
  depthTexture?: GPUTexture;
  clearValue: GPUColor;
  worldViewProjectionMatrixValue: Float32Array;
  worldMatrixValue: Float32Array;
  uniformValues: Float32Array;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  rotation: number;
  model: GpuModel;
}

let activeCleanup: (() => void | Promise<void>) | undefined;

export const multipleCanvasesScene: SandboxScene = {
  id: 'multiple-canvases',
  title: 'Many Canvas Grid',
  async mount({ root }) {
    if (activeCleanup) {
      await activeCleanup();
      activeCleanup = undefined;
    }

    const cleanup = await mountMultipleCanvasesScene(root);
    if (typeof cleanup === 'function') {
      return () => cleanup();
    }
    return cleanup;
  },
};

async function mountMultipleCanvasesScene(root: HTMLElement): Promise<SceneCleanup> {
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  const container = document.createElement('section');
  container.className = 'scene multiple-canvases-scene';
  root.appendChild(container);
  cleanupCallbacks.push(() => container.remove());

  const header = document.createElement('header');
  header.className = 'multiple-canvases-header';
  header.innerHTML = `
    <h1>Mini storefront renderer</h1>
    <p>Two hundred independent <code>&lt;canvas&gt;</code> elements share the same GPU device. Each tile spins a different mesh with a unique palette, demonstrating lightweight context configuration and per-canvas observation.</p>
  `;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'multiple-canvases-grid';
  container.appendChild(grid);

  const host = await defaultDeviceHostFactory.init({
    onError: (error) => console.error('[mini-gfx] WebGPU error:', error),
  });
  quitIfWebGPUNotAvailable(host.adapter, host.device);

  const device = host.device;
  const queue = host.queue;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  const depthFormat: GPUTextureFormat = 'depth24plus';

  const shaderCode = await fetchShader(
    new URL('../shaders/solidColorLit.wgsl', import.meta.url)
  );

  const shaderModule = device.createShaderModule({ code: shaderCode });

  const pipeline = device.createRenderPipeline({
    label: 'multiple-canvases-pipeline',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      buffers: [
        {
          arrayStride: 6 * 4,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            },
            {
              shaderLocation: 1,
              offset: 3 * 4,
              format: 'float32x3',
            },
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: depthFormat,
    },
  });

  const gpuModels = createGpuModels(device, queue);

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const canvas = entry.target as HTMLCanvasElement;
      const boxSize = Array.isArray(entry.contentBoxSize)
        ? entry.contentBoxSize[0]
        : entry.contentBoxSize;
      const width = Math.max(
        1,
        Math.min(
          boxSize ? boxSize.inlineSize : entry.contentRect.width,
          device.limits.maxTextureDimension2D
        )
      );
      const height = Math.max(
        1,
        Math.min(
          boxSize ? boxSize.blockSize : entry.contentRect.height,
          device.limits.maxTextureDimension2D
        )
      );

      canvas.width = width;
      canvas.height = height;
    }
  });

  const visibleCanvasSet = new Set<HTMLCanvasElement>();
  const intersectionObserver = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      const canvas = target as HTMLCanvasElement;
      if (isIntersecting) {
        visibleCanvasSet.add(canvas);
      } else {
        visibleCanvasSet.delete(canvas);
      }
    }
  });

  cleanupCallbacks.push(() => resizeObserver.disconnect());
  cleanupCallbacks.push(() => intersectionObserver.disconnect());

  const canvasInfoMap = new Map<HTMLCanvasElement, CanvasInfo>();

  const productsCount = 200;
  for (let i = 0; i < productsCount; i += 1) {
    const card = document.createElement('article');
    card.className = `product size${randInt(4)}`;

    const canvas = document.createElement('canvas');
    canvas.className = 'product-canvas';
    card.appendChild(canvas);

    const description = document.createElement('footer');
    description.className = 'product-label';
    description.textContent = `Product #${i + 1}`;
    card.appendChild(description);

    grid.appendChild(card);

    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);

    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Unable to acquire WebGPU context for canvas.');
    }

    context.configure({
      device,
      format: presentationFormat,
      alphaMode: 'opaque',
    });

    const uniformValues = new Float32Array(16 + 16 + 4);
    const uniformBuffer = device.createBuffer({
      size: uniformValues.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const worldViewProjectionMatrixValue = uniformValues.subarray(0, 16);
    const worldMatrixValue = uniformValues.subarray(16, 32);
    const colorValue = uniformValues.subarray(32, 36);
    colorValue.set(randColor());

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    canvasInfoMap.set(canvas, {
      context,
      clearValue: randColor(),
      worldViewProjectionMatrixValue,
      worldMatrixValue,
      uniformValues,
      uniformBuffer,
      bindGroup,
      rotation: rand(Math.PI * 2),
      model: gpuModels[randInt(gpuModels.length)],
    });
  }

  let rafId = 0;
  const frame = (timeMs: number) => {
    const time = timeMs * 0.001;
    rafId = requestAnimationFrame(frame);

    const encoder = device.createCommandEncoder();

    visibleCanvasSet.forEach((canvas) => {
      const info = canvasInfoMap.get(canvas);
      if (!info) return;

      const {
        context,
        uniformBuffer,
        uniformValues,
        worldViewProjectionMatrixValue,
        worldMatrixValue,
        bindGroup,
        clearValue,
        rotation,
        model,
      } = info;

      let { depthTexture } = info;

      const canvasTexture = context.getCurrentTexture();

      if (
        !depthTexture ||
        depthTexture.width !== canvasTexture.width ||
        depthTexture.height !== canvasTexture.height
      ) {
        depthTexture?.destroy();
        depthTexture = device.createTexture({
          size: [canvasTexture.width, canvasTexture.height],
          format: depthFormat,
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        info.depthTexture = depthTexture;
      }

      const fov = (60 * Math.PI) / 180;
      const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
      const projection = mat4.perspective(fov, aspect, 0.1, 100);

      const view = mat4.lookAt([0, 30, 50], [0, 0, 0], [0, 1, 0]);
      const viewProjection = mat4.multiply(projection, view);

      const world = mat4.rotationY(time * 0.1 + rotation);
      mat4.multiply(viewProjection, world, worldViewProjectionMatrixValue);
      worldMatrixValue.set(world);

      queue.writeBuffer(
        uniformBuffer,
        0,
        uniformValues.buffer,
        uniformValues.byteOffset,
        uniformValues.byteLength
      );

      const pass = encoder.beginRenderPass({
        label: 'multiple-canvases-render-pass',
        colorAttachments: [
          {
            view: canvasTexture.createView(),
            clearValue,
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, model.vertexBuffer);
      pass.setIndexBuffer(model.indexBuffer, model.indexFormat);
      pass.setBindGroup(0, bindGroup);
      pass.drawIndexed(model.vertexCount);
      pass.end();
    });

    const commandBuffer = encoder.finish();
    queue.submit([commandBuffer]);
  };

  rafId = requestAnimationFrame(frame);
  cleanupCallbacks.push(() => cancelAnimationFrame(rafId));

  const disposeResources = async () => {
    for (const info of canvasInfoMap.values()) {
      info.depthTexture?.destroy();
      info.uniformBuffer.destroy();
    }
    canvasInfoMap.clear();
    visibleCanvasSet.clear();
    for (const model of gpuModels) {
      model.vertexBuffer.destroy();
      model.indexBuffer.destroy();
    }
    await host.dispose();
  };

  window.addEventListener('beforeunload', disposeResources);
  cleanupCallbacks.push(() => window.removeEventListener('beforeunload', disposeResources));
  cleanupCallbacks.push(() => void disposeResources());

  const runAllCleanup = async () => {
    const callbacks = cleanupCallbacks.splice(0);
    for (const callback of callbacks) {
      await callback();
    }
    activeCleanup = undefined;
  };

  activeCleanup = runAllCleanup;
  return runAllCleanup;
}

function createGpuModels(device: GPUDevice, queue: GPUQueue): GpuModel[] {
  const result: GpuModel[] = [];
  for (const data of Object.values(modelData)) {
    const vertexBuffer = createBufferWithData(device, queue, data.vertices, GPUBufferUsage.VERTEX);
    const indexBuffer = createBufferWithData(device, queue, data.indices, GPUBufferUsage.INDEX);
    result.push({
      vertexBuffer,
      indexBuffer,
      indexFormat: 'uint32',
      vertexCount: data.indices.length,
    });
  }
  return result;
}

function createBufferWithData(
  device: GPUDevice,
  queue: GPUQueue,
  data: TypedArrayView,
  usage: GPUBufferUsageFlags
): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage | GPUBufferUsage.COPY_DST,
  });
  queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
  return buffer;
}

function rand(min = 0, max = 1): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max?: number): number {
  const high = max ?? min;
  const low = max !== undefined ? min : 0;
  return Math.floor(rand(low, high));
}

function randColor(): [number, number, number, number] {
  return [rand(), rand(), rand(), 1];
}

async function fetchShader(url: URL): Promise<string> {
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to load shader at ${url.href}`);
  }
  return response.text();
}

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    if (activeCleanup) {
      const cleanup = activeCleanup;
      activeCleanup = undefined;
      return cleanup();
    }
    return undefined;
  });
}
