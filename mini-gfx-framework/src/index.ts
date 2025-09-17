export { defaultDeviceHostFactory } from './kernel/deviceHost';
export type {
  DeviceHost,
  DeviceHostFactory,
  DeviceHostOptions,
} from './kernel/deviceHost';

export { CanvasSurfaceManager } from './platform/surfaceManager';
export type {
  SurfaceManager,
  SurfaceManagerConfig,
  FrameContext,
  FrameSize,
} from './platform/surfaceManager';

export { createResourceRegistry } from './core/resourceRegistry';
export type {
  ResourceRegistry,
  ResourceId,
  TrackedResource,
} from './core/resourceRegistry';
