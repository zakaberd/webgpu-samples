export interface SurfaceManagerConfig {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  format?: GPUTextureFormat;
  depthFormat?: GPUTextureFormat;
  sizeProvider?: () => { width: number; height: number };
  alphaMode?: GPUCanvasAlphaMode;
}

export interface FrameSize {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface FrameContext {
  colorView: GPUTextureView;
  depthView?: GPUTextureView;
  presentationFormat: GPUTextureFormat;
  size: FrameSize;
}

export interface SurfaceManager {
  readonly format: GPUTextureFormat;
  readonly depthFormat?: GPUTextureFormat;
  configure(config: SurfaceManagerConfig): void;
  acquireFrame(): FrameContext;
  resize(): void;
  dispose(): void;
}

export class CanvasSurfaceManager implements SurfaceManager {
  private config?: SurfaceManagerConfig;
  private context?: GPUCanvasContext;
  private depthTexture?: GPUTexture;
  private currentSize?: FrameSize;
  private internalFormat: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();
  private internalDepthFormat?: GPUTextureFormat;

  get format(): GPUTextureFormat {
    return this.internalFormat;
  }

  get depthFormat(): GPUTextureFormat | undefined {
    return this.internalDepthFormat;
  }

  configure(config: SurfaceManagerConfig): void {
    this.config = config;
    this.context = config.canvas.getContext('webgpu') as GPUCanvasContext;
    this.internalFormat = config.format ?? navigator.gpu.getPreferredCanvasFormat();
    this.internalDepthFormat = config.depthFormat;
    this.resize();
  }

  acquireFrame(): FrameContext {
    if (!this.config || !this.context || !this.currentSize) {
      throw new Error('Surface not configured.');
    }

    const colorView = this.context.getCurrentTexture().createView();
    const depthView = this.depthTexture?.createView();

    return {
      colorView,
      depthView,
      presentationFormat: this.internalFormat,
      size: this.currentSize,
    };
  }

  resize(): void {
    if (!this.config || !this.context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const providerSize = this.config.sizeProvider?.();
    const logicalWidth = providerSize?.width ?? this.config.canvas.clientWidth;
    const logicalHeight = providerSize?.height ?? this.config.canvas.clientHeight;
    const width = Math.max(1, Math.floor(logicalWidth * dpr));
    const height = Math.max(1, Math.floor(logicalHeight * dpr));

    this.config.canvas.width = width;
    this.config.canvas.height = height;

    this.context.configure({
      device: this.config.device,
      format: this.internalFormat,
      ...(this.config.alphaMode ? { alphaMode: this.config.alphaMode } : {}),
    });

    if (this.internalDepthFormat) {
      this.depthTexture?.destroy();
      this.depthTexture = this.config.device.createTexture({
        size: [width, height, 1],
        format: this.internalDepthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    this.currentSize = { width, height, devicePixelRatio: dpr };
  }

  dispose(): void {
    this.depthTexture?.destroy();
    this.depthTexture = undefined;
    this.context = undefined;
    this.config = undefined;
    this.currentSize = undefined;
  }
}
