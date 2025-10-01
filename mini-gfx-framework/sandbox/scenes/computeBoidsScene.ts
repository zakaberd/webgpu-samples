import {
  defaultDeviceHostFactory,
  CanvasSurfaceManager,
} from '../../src';
import { quitIfWebGPUNotAvailable } from '../util';
import { ControlsPanel } from '../ui/controls';
import type { SandboxScene, SceneCleanup } from './types';

type SimParamKey =
  | 'deltaT'
  | 'rule1Distance'
  | 'rule2Distance'
  | 'rule3Distance'
  | 'rule1Scale'
  | 'rule2Scale'
  | 'rule3Scale';

interface SimParams {
  deltaT: number;
  rule1Distance: number;
  rule2Distance: number;
  rule3Distance: number;
  rule1Scale: number;
  rule2Scale: number;
  rule3Scale: number;
}

const DEFAULT_PARAMS: SimParams = {
  deltaT: 0.04,
  rule1Distance: 0.1,
  rule2Distance: 0.025,
  rule3Distance: 0.025,
  rule1Scale: 0.02,
  rule2Scale: 0.05,
  rule3Scale: 0.005,
};

const CONTROL_METADATA: Record<SimParamKey, { label: string; min: number; max: number; step: number }>
  = {
    deltaT: { label: 'Delta T', min: 0.005, max: 0.1, step: 0.005 },
    rule1Distance: { label: 'Rule 1 Dist', min: 0.01, max: 0.3, step: 0.01 },
    rule2Distance: { label: 'Rule 2 Dist', min: 0.005, max: 0.1, step: 0.005 },
    rule3Distance: { label: 'Rule 3 Dist', min: 0.005, max: 0.1, step: 0.005 },
    rule1Scale: { label: 'Rule 1 Scale', min: 0, max: 0.1, step: 0.005 },
    rule2Scale: { label: 'Rule 2 Scale', min: 0, max: 0.1, step: 0.005 },
    rule3Scale: { label: 'Rule 3 Scale', min: 0, max: 0.05, step: 0.001 },
  };

const NUM_PARTICLES = 1500;
const PARTICLES_STRIDE = 4 * Float32Array.BYTES_PER_ELEMENT;
const VERTEX_STRIDE = 2 * Float32Array.BYTES_PER_ELEMENT;
const WORKGROUP_SIZE = 64;

export const computeBoidsScene: SandboxScene = {
  id: 'compute-boids',
  title: 'Compute Boids',
  async mount({ root }) {
    const cleanup = await mountComputeBoidsScene(root);
    if (typeof cleanup === 'function') {
      return () => cleanup();
    }
    return cleanup;
  },
};

async function mountComputeBoidsScene(root: HTMLElement): Promise<SceneCleanup> {
  const cleanupCallbacks: Array<() => void | Promise<void>> = [];
  const container = document.createElement('section');
  container.className = 'scene compute-boids-scene';
  root.appendChild(container);
  cleanupCallbacks.push(() => container.remove());

  const layout = document.createElement('div');
  layout.className = 'compute-boids-layout';
  container.appendChild(layout);

  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'compute-boids-canvas-wrapper';
  layout.appendChild(canvasWrapper);

  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas compute-boids-canvas';
  canvasWrapper.appendChild(canvas);

  const panel = new ControlsPanel('Simulation Controls');
  layout.appendChild(panel.element);

  const statsBlock = document.createElement('pre');
  statsBlock.className = 'compute-boids-stats';
  statsBlock.textContent = 'Collecting timing samples…';
  canvasWrapper.appendChild(statsBlock);

  const simParams: SimParams = { ...DEFAULT_PARAMS };
  const simParamArray = new Float32Array(7);

  const controlHandles: Partial<Record<SimParamKey, ReturnType<ControlsPanel['addNumberControl']>>> = {};
  (Object.keys(CONTROL_METADATA) as SimParamKey[]).forEach((key) => {
    const config = CONTROL_METADATA[key];
    controlHandles[key] = panel.addNumberControl({
      label: config.label,
      value: simParams[key],
      min: config.min,
      max: config.max,
      step: config.step,
      onChange(value) {
        simParams[key] = value;
        updateSimParams();
      },
    });
  });

  const { host, supportsTimestampQuery } = await initHostWithTimestampFallback(canvas);
  quitIfWebGPUNotAvailable(host.adapter, host.device);

  const surface = new CanvasSurfaceManager();
  await host.configureSurface(surface);

  const handleResize = () => surface.resize();
  window.addEventListener('resize', handleResize);
  cleanupCallbacks.push(() => window.removeEventListener('resize', handleResize));
  handleResize();

  const device = host.device;
  const queue = host.queue;
  const presentationFormat = surface.format;

  const spriteShaderCode = await fetchShader(
    new URL('../shaders/computeBoids/sprite.wgsl', import.meta.url)
  );
  const updateShaderCode = await fetchShader(
    new URL('../shaders/computeBoids/updateSprites.wgsl', import.meta.url)
  );

  const spriteShaderModule = device.createShaderModule({ code: spriteShaderCode });
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: spriteShaderModule,
      buffers: [
        {
          arrayStride: PARTICLES_STRIDE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 2 * Float32Array.BYTES_PER_ELEMENT, format: 'float32x2' },
          ],
        },
        {
          arrayStride: VERTEX_STRIDE,
          stepMode: 'vertex',
          attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: {
      module: spriteShaderModule,
      targets: [{ format: presentationFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: updateShaderCode }),
    },
  });

  const vertexData = new Float32Array([-0.01, -0.02, 0.01, -0.02, 0.0, 0.02]);
  const spriteVertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(spriteVertexBuffer.getMappedRange()).set(vertexData);
  spriteVertexBuffer.unmap();

  const simParamBufferSize = simParamArray.byteLength;
  const simParamBuffer = device.createBuffer({
    size: simParamBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  function updateSimParams() {
    simParamArray.set([
      simParams.deltaT,
      simParams.rule1Distance,
      simParams.rule2Distance,
      simParams.rule3Distance,
      simParams.rule1Scale,
      simParams.rule2Scale,
      simParams.rule3Scale,
    ]);
    queue.writeBuffer(simParamBuffer, 0, simParamArray);
  }

  updateSimParams();

  const initialParticleData = new Float32Array(NUM_PARTICLES * 4);
  for (let i = 0; i < NUM_PARTICLES; i += 1) {
    initialParticleData[4 * i + 0] = 2 * (Math.random() - 0.5);
    initialParticleData[4 * i + 1] = 2 * (Math.random() - 0.5);
    initialParticleData[4 * i + 2] = 0.2 * (Math.random() - 0.5);
    initialParticleData[4 * i + 3] = 0.2 * (Math.random() - 0.5);
  }

  const particleBuffers: GPUBuffer[] = new Array(2);
  const particleBindGroups: GPUBindGroup[] = new Array(2);
  const particleBufferSize = initialParticleData.byteLength;

  for (let i = 0; i < 2; i += 1) {
    const buffer = device.createBuffer({
      size: particleBufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(initialParticleData);
    buffer.unmap();
    particleBuffers[i] = buffer;
  }

  for (let i = 0; i < 2; i += 1) {
    particleBindGroups[i] = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: simParamBuffer } },
        { binding: 1, resource: { buffer: particleBuffers[i] } },
        { binding: 2, resource: { buffer: particleBuffers[(i + 1) % 2] } },
      ],
    });
  }

  let querySet: GPUQuerySet | undefined;
  let resolveBuffer: GPUBuffer | undefined;
  const spareBuffers: GPUBuffer[] = [];
  if (supportsTimestampQuery && host.device.features.has('timestamp-query')) {
    querySet = device.createQuerySet({ type: 'timestamp', count: 4 });
    resolveBuffer = device.createBuffer({
      size: 4 * BigInt64Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
  }

  const computePassDescriptor: GPUComputePassDescriptor = querySet
    ? {
        timestampWrites: {
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      }
    : {};

  const renderPassBaseDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: undefined as GPUTextureView | undefined,
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  if (querySet) {
    renderPassBaseDescriptor.timestampWrites = {
      querySet,
      beginningOfPassWriteIndex: 2,
      endOfPassWriteIndex: 3,
    };
  }

  let frameIndex = 0;
  let rafId = 0;
  let disposed = false;
  let computeDurationSum = 0;
  let renderDurationSum = 0;
  let timerSamples = 0;

  const frame = () => {
    if (disposed) {
      return;
    }

    const frameContext = surface.acquireFrame();
    const commandEncoder = device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass(computePassDescriptor);
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, particleBindGroups[frameIndex % 2]);
    computePass.dispatchWorkgroups(Math.ceil(NUM_PARTICLES / WORKGROUP_SIZE));
    computePass.end();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      ...renderPassBaseDescriptor,
    };
    renderPassDescriptor.colorAttachments = [
      {
        ...(renderPassBaseDescriptor.colorAttachments?.[0] as GPURenderPassColorAttachment),
        view: frameContext.colorView,
      },
    ];

    const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);
    renderPass.setVertexBuffer(0, particleBuffers[(frameIndex + 1) % 2]);
    renderPass.setVertexBuffer(1, spriteVertexBuffer);
    renderPass.draw(3, NUM_PARTICLES, 0, 0);
    renderPass.end();

    let readbackBuffer: GPUBuffer | undefined;
    if (querySet && resolveBuffer) {
      readbackBuffer =
        spareBuffers.pop() ||
        device.createBuffer({
          size: 4 * BigInt64Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
      commandEncoder.resolveQuerySet(querySet, 0, 4, resolveBuffer, 0);
      commandEncoder.copyBufferToBuffer(resolveBuffer, 0, readbackBuffer, 0, resolveBuffer.size);
    }

    queue.submit([commandEncoder.finish()]);

    if (readbackBuffer) {
      readbackBuffer
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (disposed) {
            readbackBuffer?.destroy();
            return;
          }
          const times = new BigInt64Array(readbackBuffer.getMappedRange());
          const computeDuration = Number(times[1] - times[0]);
          const renderDuration = Number(times[3] - times[2]);
          if (computeDuration > 0 && renderDuration > 0) {
            computeDurationSum += computeDuration;
            renderDurationSum += renderDuration;
            timerSamples += 1;
          }
          readbackBuffer.unmap();

          if (timerSamples >= 100) {
            const avgCompute = Math.round(computeDurationSum / timerSamples / 1000);
            const avgRender = Math.round(renderDurationSum / timerSamples / 1000);
            statsBlock.textContent = `avg compute pass: ${avgCompute}µs\n` +
              `avg render pass:  ${avgRender}µs\n` +
              `spare readbacks:  ${spareBuffers.length}`;
            computeDurationSum = 0;
            renderDurationSum = 0;
            timerSamples = 0;
          }
          spareBuffers.push(readbackBuffer);
        })
        .catch(() => {
          if (!disposed) {
            console.warn('[mini-gfx] timestamp readback failed');
          }
          readbackBuffer?.destroy();
        });
    }

    frameIndex += 1;
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  const disposeResources = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelAnimationFrame(rafId);
    spriteVertexBuffer.destroy();
    simParamBuffer.destroy();
    particleBuffers.forEach((buffer) => buffer.destroy());
    spareBuffers.splice(0).forEach((buffer) => buffer.destroy());
    querySet?.destroy?.();
    resolveBuffer?.destroy();
    surface.dispose();
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

async function initHostWithTimestampFallback(canvas: HTMLCanvasElement) {
  try {
    const host = await defaultDeviceHostFactory.init({
      canvas,
      requiredFeatures: ['timestamp-query'],
      surfaceConfig: {},
      onError: (error) => console.error('[mini-gfx] WebGPU error:', error),
    });
    return { host, supportsTimestampQuery: true } as const;
  } catch (error) {
    console.warn('[mini-gfx] timestamp-query unsupported, continuing without timings');
    const host = await defaultDeviceHostFactory.init({
      canvas,
      surfaceConfig: {},
      onError: (err) => console.error('[mini-gfx] WebGPU error:', err),
    });
    return { host, supportsTimestampQuery: false } as const;
  }
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
    /* noop – cleanup handled via scene API */
  });
}
