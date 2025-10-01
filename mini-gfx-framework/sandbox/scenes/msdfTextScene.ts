import { mat4, Mat4, vec3 } from 'wgpu-matrix';

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
import {
  MsdfFont,
  MsdfText,
  MsdfTextRenderer,
} from '../textRenderingMsdf/msdfText';
import { quitIfWebGPUNotAvailable } from '../util';
import type { SandboxScene, SceneCleanup } from './types';

let activeCleanup: (() => void | Promise<void>) | undefined;

async function mountMsdfTextScene(root: HTMLElement): Promise<SceneCleanup> {
  if (activeCleanup) {
    await activeCleanup();
    activeCleanup = undefined;
  }

  const cleanupCallbacks: (() => void | Promise<void>)[] = [];

  const container = document.createElement('div');
  container.className = 'scene msdf-text-scene';
  root.appendChild(container);
  cleanupCallbacks.push(() => container.remove());

  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas';
  container.appendChild(canvas);

  const info = document.createElement('div');
  info.className = 'info';
  info.textContent = 'Mini GFX MSDF sandbox';
  container.appendChild(info);

  const host = await defaultDeviceHostFactory.init({
    canvas,
    requiredLimits: {
      maxStorageBuffersInFragmentStage: 1,
      maxStorageBuffersInVertexStage: 2,
    },
    onError: (error) => console.error('[mini-gfx] WebGPU error:', error),
    surfaceConfig: {
      depthFormat: 'depth24plus',
    },
  });

  quitIfWebGPUNotAvailable(host.adapter, host.device);

  const surface = new CanvasSurfaceManager();
  await host.configureSurface(surface);
  const handleResize = () => surface.resize();
  window.addEventListener('resize', handleResize);
  cleanupCallbacks.push(() =>
    window.removeEventListener('resize', handleResize)
  );

  const device = host.device;
  const queue = host.queue;
  const presentationFormat = surface.format;
  const depthFormat = surface.depthFormat ?? 'depth24plus';

  const textRenderer = new MsdfTextRenderer(
    device,
    presentationFormat,
    depthFormat
  );
  const font = await textRenderer.createFont(
    new URL('../assets/font/ya-hei-ascii-msdf.json', import.meta.url).toString()
  );

  const faceTexts = createFaceTexts(textRenderer, font);
  const titleText = textRenderer.formatText(font, 'WebGPU', {
    centered: true,
    pixelScale: 1 / 128,
  });
  const largeText = createLargeText(textRenderer, font);
  const textObjects: MsdfText[] = [...faceTexts, titleText, largeText];

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
  const reusableTextMatrix = mat4.create();

  const cubeFaceTransforms: Mat4[] = [
    createTextTransform([0, 0, 1.1]),
    createTextTransform([0, 0, -1.1], [0, Math.PI, 0]),
    createTextTransform([1.1, 0, 0], [0, Math.PI / 2, 0]),
    createTextTransform([-1.1, 0, 0], [0, -Math.PI / 2, 0]),
    createTextTransform([0, 1.1, 0], [-Math.PI / 2, 0, 0]),
    createTextTransform([0, -1.1, 0], [Math.PI / 2, 0, 0]),
  ];

  const startTime = performance.now();
  let rafId = 0;
  const frame = () => {
    rafId = requestAnimationFrame(frame);

    const frameContext = surface.acquireFrame();
    updateSceneMatrices(
      frameContext,
      projectionMatrix,
      viewMatrix,
      modelMatrix,
      modelViewProjectionMatrix
    );

    queue.writeBuffer(
      uniformBuffer,
      0,
      modelViewProjectionMatrix.buffer,
      modelViewProjectionMatrix.byteOffset,
      modelViewProjectionMatrix.byteLength
    );

    updateCubeFaceText(
      cubeFaceTransforms,
      faceTexts,
      modelMatrix,
      reusableTextMatrix
    );
    updateScrollingText(titleText, largeText, startTime, reusableTextMatrix);
    textRenderer.updateCamera(projectionMatrix, viewMatrix);

    const colorAttachment: GPURenderPassColorAttachment = {
      view: frameContext.colorView,
      clearValue: [0, 0, 0, 1],
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
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [colorAttachment],
      depthStencilAttachment: depthAttachment,
    });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.setVertexBuffer(0, verticesBuffer);
    passEncoder.draw(cubeVertexCount, 1, 0, 0);
    textRenderer.render(passEncoder, ...textObjects);
    passEncoder.end();

    queue.submit([commandEncoder.finish()]);
  };

  rafId = requestAnimationFrame(frame);
  cleanupCallbacks.push(() => cancelAnimationFrame(rafId));

  const disposeResources = async () => {
    verticesBuffer.destroy();
    uniformBuffer.destroy();
    textObjects.forEach((text) => text.textBuffer.destroy());
    surface.dispose();
    await host.dispose();
  };
  window.addEventListener('beforeunload', disposeResources);
  cleanupCallbacks.push(() =>
    window.removeEventListener('beforeunload', disposeResources)
  );
  cleanupCallbacks.push(() => void disposeResources());
  const runAllCleanup = async () => {
      for (const callback of cleanupCallbacks.splice(0)) {
        await callback();
      }
      activeCleanup = undefined;
    };

  activeCleanup = runAllCleanup;
  return runAllCleanup;
}

export const msdfTextScene: SandboxScene = {
  id: 'msdf-text',
  title: 'MSDF Text Showcase',
  async mount({ root }) {
    const cleanup = await mountMsdfTextScene(root);
    if (typeof cleanup === 'function') {
      return () => cleanup();
    }
    return cleanup;
  },
};

function createFaceTexts(
  renderer: MsdfTextRenderer,
  font: MsdfFont
): MsdfText[] {
  return [
    renderer.formatText(font, 'Front', {
      centered: true,
      pixelScale: 1 / 128,
      color: [1, 0, 0, 1],
    }),
    renderer.formatText(font, 'Back', {
      centered: true,
      pixelScale: 1 / 128,
      color: [0, 1, 1, 1],
    }),
    renderer.formatText(font, 'Right', {
      centered: true,
      pixelScale: 1 / 128,
      color: [0, 1, 0, 1],
    }),
    renderer.formatText(font, 'Left', {
      centered: true,
      pixelScale: 1 / 128,
      color: [1, 0, 1, 1],
    }),
    renderer.formatText(font, 'Top', {
      centered: true,
      pixelScale: 1 / 128,
      color: [0, 0, 1, 1],
    }),
    renderer.formatText(font, 'Bottom', {
      centered: true,
      pixelScale: 1 / 128,
      color: [1, 1, 0, 1],
    }),
  ];
}

function createLargeText(renderer: MsdfTextRenderer, font: MsdfFont): MsdfText {
  return renderer.formatText(
    font,
    `
WebGPU exposes an API for performing operations, such as rendering
and computation, on a Graphics Processing Unit.

Graphics Processing Units, or GPUs for short, have been essential
in enabling rich rendering and computational applications in personal
computing. WebGPU is an API that exposes the capabilities of GPU
hardware for the Web. The API is designed from the ground up to
efficiently map to (post-2014) native GPU APIs. WebGPU is not related
to WebGL and does not explicitly target OpenGL ES.

WebGPU sees physical GPU hardware as GPUAdapters. It provides a
connection to an adapter via GPUDevice, which manages resources, and
the device's GPUQueues, which execute commands. GPUDevice may have
its own memory with high-speed access to the processing units.
GPUBuffer and GPUTexture are the physical resources backed by GPU
memory. GPUCommandBuffer and GPURenderBundle are containers for
user-recorded commands. GPUShaderModule contains shader code. The
other resources, such as GPUSampler or GPUBindGroup, configure the
way physical resources are used by the GPU.

GPUs execute commands encoded in GPUCommandBuffers by feeding data
through a pipeline, which is a mix of fixed-function and programmable
stages. Programmable stages execute shaders, which are special
programs designed to run on GPU hardware. Most of the state of a
pipeline is defined by a GPURenderPipeline or a GPUComputePipeline
object. The state not included in these pipeline objects is set
during encoding with commands, such as beginRenderPass() or
setBlendConstant().`,
    { pixelScale: 1 / 256 }
  );
}
function updateSceneMatrices(
  frame: FrameContext,
  projectionMatrix: Mat4,
  viewMatrix: Mat4,
  modelMatrix: Mat4,
  modelViewProjectionMatrix: Mat4
) {
  const aspect = frame.size.width / frame.size.height;
  const freshProjection = mat4.perspective((2 * Math.PI) / 5, aspect, 1, 100);
  projectionMatrix.set(freshProjection);

  mat4.identity(viewMatrix);
  mat4.translate(viewMatrix, vec3.fromValues(0, 0, -5), viewMatrix);

  const time = performance.now() / 5000;
  mat4.identity(modelMatrix);
  mat4.translate(modelMatrix, vec3.fromValues(0, 2, -3), modelMatrix);
  mat4.rotate(
    modelMatrix,
    vec3.fromValues(Math.sin(time), Math.cos(time), 0),
    1,
    modelMatrix
  );

  mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);
  mat4.multiply(
    modelViewProjectionMatrix,
    modelMatrix,
    modelViewProjectionMatrix
  );
}

function updateCubeFaceText(
  transforms: Mat4[],
  texts: MsdfText[],
  modelMatrix: Mat4,
  reusable: Mat4
) {
  transforms.forEach((transform, index) => {
    mat4.multiply(modelMatrix, transform, reusable);
    texts[index].setTransform(reusable);
  });
}

function updateScrollingText(
  title: MsdfText,
  body: MsdfText,
  startTime: number,
  reusable: Mat4
) {
  const crawl = ((performance.now() - startTime) / 2500) % 14;
  mat4.identity(reusable);
  mat4.rotateX(reusable, -Math.PI / 8, reusable);
  mat4.translate(reusable, [0, crawl - 3, 0], reusable);
  title.setTransform(reusable);

  mat4.translate(reusable, [-3, -0.1, 0], reusable);
  body.setTransform(reusable);
}

function createTextTransform(
  position: [number, number, number],
  rotation?: [number, number, number]
) {
  const transform = mat4.identity(mat4.create());
  mat4.translate(transform, position, transform);
  if (rotation) {
    if (rotation[0]) mat4.rotateX(transform, rotation[0], transform);
    if (rotation[1]) mat4.rotateY(transform, rotation[1], transform);
    if (rotation[2]) mat4.rotateZ(transform, rotation[2], transform);
  }
  return transform;
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
