import { mat4, vec3, type Mat4 } from 'wgpu-matrix';

import {
  defaultDeviceHostFactory,
  CanvasSurfaceManager,
  type FrameContext,
} from '../../src';

import {
  cubeVertexArray,
  cubeVertexCount,
  cubeVertexSize,
  cubePositionOffset,
  cubeUVOffset,
} from '../meshes/cube';
import { quitIfWebGPUNotAvailable } from '../util';
import type { SandboxScene, SceneCleanup } from './types';

let activeCleanup: (() => void | Promise<void>) | undefined;

export const transparentCanvasScene: SandboxScene = {
  id: 'transparent-canvas',
  title: 'Transparent Canvas',
  async mount({ root }) {
    if (activeCleanup) {
      await activeCleanup();
      activeCleanup = undefined;
    }

    const cleanup = await mountTransparentCanvasScene(root);
    if (typeof cleanup === 'function') {
      return () => cleanup();
    }
    return cleanup;
  },
};

async function mountTransparentCanvasScene(root: HTMLElement): Promise<SceneCleanup> {
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  const container = document.createElement('section');
  container.className = 'scene transparent-canvas-scene';
  root.appendChild(container);
  cleanupCallbacks.push(() => container.remove());

  const content = document.createElement('article');
  content.className = 'transparent-canvas-content';
  content.innerHTML = `
    <h1>WebGPU</h1>
    <p>WebGPU exposes an API for performing operations, such as rendering and computation, on a Graphics Processing Unit.</p>
    <p>Graphics Processing Units, or GPUs for short, have been essential in enabling rich rendering and computational applications in personal computing. WebGPU is an API that exposes the capabilities of GPU hardware for the Web. The API is designed from the ground up to efficiently map to (post-2014) native GPU APIs. WebGPU is not related to WebGL and does not explicitly target OpenGL ES.</p>
    <p>WebGPU sees physical GPU hardware as <em>GPUAdapter</em>s. It provides a connection to an adapter via <em>GPUDevice</em>, which manages resources, and the device's <em>GPUQueue</em>, which execute commands. <em>GPUDevice</em> may have its own memory with high-speed access to the processing units. <em>GPUBuffer</em> and <em>GPUTexture</em> are the physical resources backed by GPU memory. <em>GPUCommandBuffer</em> and <em>GPURenderBundle</em> are containers for user-recorded commands. <em>GPUShaderModule</em> contains shader code.</p>
  `;
  container.appendChild(content);

  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas transparent-canvas-layer';
  container.appendChild(canvas);

  const host = await defaultDeviceHostFactory.init({
    canvas,
    surfaceConfig: {
      depthFormat: 'depth24plus',
      alphaMode: 'premultiplied',
    },
    onError: (error) => console.error('[mini-gfx] WebGPU error:', error),
  });

  quitIfWebGPUNotAvailable(host.adapter, host.device);

  const surface = new CanvasSurfaceManager();
  await host.configureSurface(surface);

  const handleResize = () => surface.resize();
  window.addEventListener('resize', handleResize);
  cleanupCallbacks.push(() => window.removeEventListener('resize', handleResize));

  const device = host.device;
  const queue = host.queue;
  const presentationFormat = surface.format;
  const depthFormat = surface.depthFormat ?? 'depth24plus';

  const vertexShaderCode = await fetchShader(
    new URL('../shaders/basic.vert.wgsl', import.meta.url)
  );
  const fragmentShaderCode = await fetchShader(
    new URL('../shaders/vertexPositionColor.frag.wgsl', import.meta.url)
  );

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({ code: vertexShaderCode }),
      buffers: [
        {
          arrayStride: cubeVertexSize,
          attributes: [
            {
              shaderLocation: 0,
              offset: cubePositionOffset,
              format: 'float32x4',
            },
            {
              shaderLocation: 1,
              offset: cubeUVOffset,
              format: 'float32x2',
            },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: fragmentShaderCode }),
      targets: [
        {
          format: presentationFormat,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: depthFormat,
    },
  });

  const verticesBuffer = device.createBuffer({
    size: cubeVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(cubeVertexArray);
  verticesBuffer.unmap();

  const uniformBufferSize = 4 * 16;
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  });

  const projectionMatrix = mat4.create();
  const viewMatrix = mat4.create();
  const modelMatrix = mat4.create();
  const modelViewProjectionMatrix = mat4.create();
  const rotationAxis = vec3.create();
  const cameraOffset = vec3.fromValues(0, 0, -4);

  let rafId = 0;
  const frame = () => {
    rafId = requestAnimationFrame(frame);

    const frameContext = surface.acquireFrame();
    updateMatrices(
      frameContext,
      projectionMatrix,
      viewMatrix,
      modelMatrix,
      modelViewProjectionMatrix,
      rotationAxis,
      cameraOffset
    );

    queue.writeBuffer(
      uniformBuffer,
      0,
      modelViewProjectionMatrix.buffer,
      modelViewProjectionMatrix.byteOffset,
      modelViewProjectionMatrix.byteLength
    );

    const colorAttachment: GPURenderPassColorAttachment = {
      view: frameContext.colorView,
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    };

    const depthAttachment: GPURenderPassDepthStencilAttachment | undefined =
      frameContext.depthView
        ? {
            view: frameContext.depthView,
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          }
        : undefined;

    const commandEncoder = device.createCommandEncoder();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
    };
    if (depthAttachment) {
      renderPassDescriptor.depthStencilAttachment = depthAttachment;
    }

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.draw(cubeVertexCount);
    passEncoder.end();

    queue.submit([commandEncoder.finish()]);
  };

  rafId = requestAnimationFrame(frame);
  cleanupCallbacks.push(() => cancelAnimationFrame(rafId));

  const disposeResources = async () => {
    verticesBuffer.destroy();
    uniformBuffer.destroy();
    surface.dispose();
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

function updateMatrices(
  frame: FrameContext,
  projectionMatrix: Mat4,
  viewMatrix: Mat4,
  modelMatrix: Mat4,
  modelViewProjectionMatrix: Mat4,
  rotationAxis: Float32Array,
  cameraOffset: Float32Array
) {
  const aspect = frame.size.width / frame.size.height || 1;
  const freshProjection = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100);
  projectionMatrix.set(freshProjection);

  mat4.identity(viewMatrix);
  mat4.translate(viewMatrix, cameraOffset, viewMatrix);

  const time = performance.now() / 1000;
  rotationAxis[0] = Math.sin(time);
  rotationAxis[1] = Math.cos(time);
  rotationAxis[2] = 0;
  mat4.rotate(viewMatrix, rotationAxis, 1, viewMatrix);

  mat4.identity(modelMatrix);
  mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);
  mat4.multiply(modelViewProjectionMatrix, modelMatrix, modelViewProjectionMatrix);
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
