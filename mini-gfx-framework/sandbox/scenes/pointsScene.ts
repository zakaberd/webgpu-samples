import { mat4 } from 'wgpu-matrix';

import {
  defaultDeviceHostFactory,
  CanvasSurfaceManager,
  type FrameContext,
} from '../../src';
import { quitIfWebGPUNotAvailable } from '../util';
import { ControlsPanel } from '../ui/controls';
import type { SandboxScene, SceneCleanup } from './types';

interface PointSettings {
  fixedSize: boolean;
  textured: boolean;
  size: number;
}

const DEFAULT_SETTINGS: PointSettings = {
  fixedSize: false,
  textured: false,
  size: 10,
};

const VERTEX_RADIUS = 1;
const NUM_SAMPLES = 1000;
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

export const pointsScene: SandboxScene = {
  id: 'points',
  title: 'Point Rendering Variations',
  async mount({ root }) {
    const cleanup = await mountPointsScene(root);
    if (typeof cleanup === 'function') {
      return () => cleanup();
    }
    return cleanup;
  },
};

async function mountPointsScene(root: HTMLElement): Promise<SceneCleanup> {
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];

  const container = document.createElement('section');
  container.className = 'scene points-scene';
  root.appendChild(container);
  cleanupCallbacks.push(() => container.remove());

  const layout = document.createElement('div');
  layout.className = 'points-layout';
  container.appendChild(layout);

  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'points-canvas-wrapper';
  layout.appendChild(canvasWrapper);

  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas points-canvas';
  canvasWrapper.appendChild(canvas);

  const panel = new ControlsPanel('Render Controls');
  layout.appendChild(panel.element);

  const settings: PointSettings = { ...DEFAULT_SETTINGS };

  panel.addNumberControl({
    label: 'Size',
    value: settings.size,
    min: 0,
    max: 80,
    step: 1,
    onChange(value) {
      settings.size = value;
    },
  });

  panel.appendCustomField(
    createToggleField('Fixed size', settings.fixedSize, (value) => {
      settings.fixedSize = value;
    })
  );
  panel.appendCustomField(
    createToggleField('Textured', settings.textured, (value) => {
      settings.textured = value;
    })
  );

  const { host } = await initDevice(canvas);
  quitIfWebGPUNotAvailable(host.adapter, host.device);

  const surface = new CanvasSurfaceManager();
  await host.configureSurface(surface);
  const handleResize = () => surface.resize();
  window.addEventListener('resize', handleResize);
  cleanupCallbacks.push(() => window.removeEventListener('resize', handleResize));
  handleResize();

  const device = host.device;
  const queue = host.queue;

  const shaderModules = await loadShaderModules(device);

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {},
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipelines = createPipelines(device, pipelineLayout, shaderModules, surface.format);

  const vertexData = createFibonacciSphereVertices({
    radius: VERTEX_RADIUS,
    numSamples: NUM_SAMPLES,
  });

  const vertexBuffer = device.createBuffer({
    label: 'points-vertex-buffer',
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  queue.writeBuffer(vertexBuffer, 0, vertexData);

  const uniformValues = new Float32Array(20);
  const uniformBuffer = device.createBuffer({
    size: uniformValues.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const matrixValue = uniformValues.subarray(0, 16);
  const resolutionValue = uniformValues.subarray(16, 18);
  const sizeValue = uniformValues.subarray(18, 19);

  const { textureView, texture, sampler } = await createEmojiTexture(device);

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: textureView },
    ],
  });

  const depthTextureManager = createDepthTextureManager(device);

  let disposed = false;
  let rafId = 0;

  const frame = () => {
    if (disposed) {
      return;
    }

    const frameContext = surface.acquireFrame();
    depthTextureManager.ensure(frameContext);

    const { size, fixedSize, textured } = settings;
    const pipeline = pipelines[fixedSize ? 1 : 0][textured ? 1 : 0];

    sizeValue[0] = size;
    updateMatrices(frameContext, matrixValue);
    resolutionValue.set([frameContext.size.width, frameContext.size.height]);
    queue.writeBuffer(uniformBuffer, 0, uniformValues);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: frameContext.colorView,
          clearValue: [0.2, 0.2, 0.2, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: depthTextureManager.view,
    });
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, vertexData.length / 3);
    pass.end();

    queue.submit([encoder.finish()]);

    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  const disposeResources = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelAnimationFrame(rafId);
    vertexBuffer.destroy();
    uniformBuffer.destroy();
    depthTextureManager.dispose();
    texture.destroy();
    await host.dispose();
  };

  window.addEventListener('beforeunload', disposeResources);
  cleanupCallbacks.push(() => window.removeEventListener('beforeunload', disposeResources));
  cleanupCallbacks.push(() => disposeResources());

  return async () => {
    while (cleanupCallbacks.length) {
      await cleanupCallbacks.pop()?.();
    }
  };
}

async function initDevice(canvas: HTMLCanvasElement) {
  const host = await defaultDeviceHostFactory.init({
    canvas,
    surfaceConfig: {
      depthFormat: DEPTH_FORMAT,
    },
    onError: (error) => console.error('[mini-gfx] WebGPU error:', error),
  });
  return { host } as const;
}

async function loadShaderModules(device: GPUDevice) {
  const shaderURLs = {
    distanceSized: new URL('../shaders/points/distanceSizedPoints.vert.wgsl', import.meta.url),
    fixedSized: new URL('../shaders/points/fixedSizePoints.vert.wgsl', import.meta.url),
    orangeFragment: new URL('../shaders/points/orange.frag.wgsl', import.meta.url),
    texturedFragment: new URL('../shaders/points/textured.frag.wgsl', import.meta.url),
  } as const;

  const [distanceSizedCode, fixedSizedCode, orangeFragCode, texturedFragCode] = await Promise.all([
    fetchShader(shaderURLs.distanceSized),
    fetchShader(shaderURLs.fixedSized),
    fetchShader(shaderURLs.orangeFragment),
    fetchShader(shaderURLs.texturedFragment),
  ]);

  return {
    distanceSized: device.createShaderModule({ code: distanceSizedCode }),
    fixedSized: device.createShaderModule({ code: fixedSizedCode }),
    orangeFragment: device.createShaderModule({ code: orangeFragCode }),
    texturedFragment: device.createShaderModule({ code: texturedFragCode }),
  } as const;
}

function createPipelines(
  device: GPUDevice,
  pipelineLayout: GPUPipelineLayout,
  shaders: Awaited<ReturnType<typeof loadShaderModules>>,
  presentationFormat: GPUTextureFormat
) {
  const vertexLayouts: GPUVertexBufferLayout[] = [
    {
      arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
      stepMode: 'instance',
      attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
    },
  ];

  const pipelineFor = (
    vertexShader: GPUShaderModule,
    fragmentShader: GPUShaderModule
  ) =>
    device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: vertexShader,
        buffers: vertexLayouts,
      },
      fragment: {
        module: fragmentShader,
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
              },
            },
          },
        ],
      },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });

  return [
    [
      pipelineFor(shaders.distanceSized, shaders.orangeFragment),
      pipelineFor(shaders.distanceSized, shaders.texturedFragment),
    ],
    [
      pipelineFor(shaders.fixedSized, shaders.orangeFragment),
      pipelineFor(shaders.fixedSized, shaders.texturedFragment),
    ],
  ] as const;
}

function createFibonacciSphereVertices({
  numSamples,
  radius,
}: {
  numSamples: number;
  radius: number;
}) {
  const vertices = new Float32Array(numSamples * 3);
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < numSamples; i += 1) {
    const offset = 2 / numSamples;
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(1 - y * y);
    const phi = (i % numSamples) * increment;
    const x = Math.cos(phi) * r;
    const z = Math.sin(phi) * r;
    vertices.set([x * radius, y * radius, z * radius], i * 3);
  }
  return vertices;
}

function createDepthTextureManager(device: GPUDevice) {
  let current:
    | {
        texture: GPUTexture;
        view: GPURenderPassDepthStencilAttachment;
      }
    | undefined;
  return {
    get view() {
      return current?.view;
    },
    ensure(frame: FrameContext) {
      if (
        current?.texture.width !== frame.size.width ||
        current?.texture.height !== frame.size.height
      ) {
        current?.texture.destroy();
        const texture = device.createTexture({
          size: [frame.size.width, frame.size.height],
          format: DEPTH_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        current = {
          texture,
          view: {
            view: texture.createView(),
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        };
      }
    },
    dispose() {
      current?.texture.destroy();
      current = undefined;
    },
  };
}

async function createEmojiTexture(device: GPUDevice) {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if ('OffscreenCanvas' in globalThis) {
    canvas = new OffscreenCanvas(64, 64);
  } else {
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = 64;
    fallbackCanvas.height = 64;
    canvas = fallbackCanvas;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D context for emoji texture.');
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '60px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🦋', canvas.width / 2, canvas.height / 2);

  const sampler = device.createSampler();
  const texture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  await device.queue.copyExternalImageToTexture(
    { source: canvas as HTMLCanvasElement | OffscreenCanvas, flipY: true },
    { texture },
    [canvas.width, canvas.height]
  );

  return {
    sampler,
    texture,
    textureView: texture.createView(),
  } as const;
}

function updateMatrices(frame: FrameContext, target: Float32Array) {
  const projection = mat4.perspective((90 * Math.PI) / 180, frame.size.width / frame.size.height, 0.1, 50);
  const view = mat4.lookAt([0, 0, 1.5], [0, 0, 0], [0, 1, 0]);
  const viewProjection = mat4.multiply(projection, view);
  const time = performance.now() / 1000;
  mat4.rotateY(viewProjection, time, viewProjection);
  mat4.rotateX(viewProjection, time * 0.1, target);
  target.set(viewProjection);
}

function createToggleField(
  label: string,
  initial: boolean,
  onChange: (value: boolean) => void
) {
  const wrapper = document.createElement('label');
  wrapper.className = 'controls-panel__field';

  const caption = document.createElement('span');
  caption.className = 'controls-panel__label';
  caption.textContent = label;
  wrapper.appendChild(caption);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = initial;
  input.className = 'controls-panel__checkbox';
  input.addEventListener('change', () => onChange(input.checked));
  wrapper.appendChild(input);
  return wrapper;
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
}
