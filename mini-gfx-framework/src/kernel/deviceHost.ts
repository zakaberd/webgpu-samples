import type { ResourceRegistry } from '../core/resourceRegistry';
import { createResourceRegistry as createResourceRegistryImpl } from '../core/resourceRegistry';
import type { SurfaceManager } from '../platform/surfaceManager';

export interface DeviceHostOptions {
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Partial<GPUSupportedLimits>;
  canvas?: HTMLCanvasElement;
  onError?: (error: Error) => void;
  surfaceConfig?: {
    format?: GPUTextureFormat;
    depthFormat?: GPUTextureFormat;
    sizeProvider?: () => { width: number; height: number };
  };
}

export interface DeviceHost {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly limits: GPUSupportedLimits;
  configureSurface(surface: SurfaceManager): Promise<void>;
  createResourceRegistry(): ResourceRegistry;
  dispose(): Promise<void>;
}

export interface DeviceHostFactory {
  init(options?: DeviceHostOptions): Promise<DeviceHost>;
}

export const defaultDeviceHostFactory: DeviceHostFactory = {
  async init(options: DeviceHostOptions = {}): Promise<DeviceHost> {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU is not available in this environment.');
    }

    const adapter = await navigator.gpu.requestAdapter({
      featureLevel: 'compatibility',
    });
    if (!adapter) {
      throw new Error('Unable to acquire a GPU adapter.');
    }

    try {
      const device = await adapter.requestDevice({
        requiredFeatures: options.requiredFeatures,
        requiredLimits: options.requiredLimits,
      });

      const queue = device.queue;
      const limits = device.limits;
      const disposables: Array<() => void | Promise<void>> = [];

      if (options.onError) {
        const handleUncapturedError = (event: GPUUncapturedErrorEvent) => {
          options.onError?.(event.error);
        };
        device.addEventListener('uncapturederror', handleUncapturedError);
        disposables.push(() => device.removeEventListener('uncapturederror', handleUncapturedError));

        device.lost
          .then((info) => {
            options.onError?.(new Error(`Device lost (${info.reason}): ${info.message}`));
          })
          .catch(() => {
            /* ignore */
          });
      }

      const host: DeviceHost = {
        adapter,
        device,
        queue,
        limits,
        async configureSurface(surface: SurfaceManager): Promise<void> {
          const canvas = options.canvas;
          if (!canvas) {
            throw new Error('DeviceHost options.canvas is required to configure a surface.');
          }

          surface.configure({
            device,
            canvas,
            format: options.surfaceConfig?.format,
            depthFormat: options.surfaceConfig?.depthFormat,
            sizeProvider: options.surfaceConfig?.sizeProvider,
          });
        },
        createResourceRegistry(): ResourceRegistry {
          return createResourceRegistryImpl();
        },
        async dispose(): Promise<void> {
          for (const dispose of disposables.splice(0, disposables.length)) {
            await dispose();
          }
          if (typeof (device as GPUDevice & { destroy?: () => void }).destroy === 'function') {
            (device as GPUDevice & { destroy: () => void }).destroy();
          }
        },
      };

      return host;
    } catch (error) {
      options.onError?.(
        error instanceof Error ? error : new Error('Failed to initialize GPU device.')
      );
      throw error;
    }
  },
};
