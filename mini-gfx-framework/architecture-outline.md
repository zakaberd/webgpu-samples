# Mini GFX Kernel Architecture Outline

## Design Principles
- **Pedagogical clarity**: Code should read like a tutorial while remaining production-informative.
- **Composable core**: Separate device management, render graph primitives, and feature modules (text, geometry, etc.).
- **Deterministic data flow**: Favor explicit resource lifetimes and declarative pass configuration.
- **Performance awareness**: Minimal abstractions around GPU queues and buffers; allow opt-in tuning hooks.
- **AI-friendly structure**: Modules and docs organized so assistants can reason about boundaries and contracts easily.

## Layered Overview
1. **Platform Layer** (`platform/`)
   - Browser/DOM adapters (canvas, resize handling, input events).
   - Feature detection, adapter/device acquisition, error routing.
2. **Kernel Core** (`kernel/`)
   - Device/context manager (`DeviceHost`).
   - Swap chain / presentation management (`SurfaceManager`).
   - Command graph builder (pass scheduling, dependencies, attachments).
   - Resource registry (buffers, textures, bind groups with lifetime tracking).
3. **Feature Modules** (`modules/`)
   - Text MSDF module (font loading, layout, render bundles).
   - Geometry primitives (cube, quad, mesh loaders).
   - Material/shader library (WGSL modules, pipeline descriptors).
4. **Sample Layer** (`samples/`)
   - Wiring for `textRenderingMsdf` scenario.
   - Scene orchestration (camera updates, animation loop, input bindings).
5. **Tooling & Docs** (`docs/`, `scripts/`)
   - Baselines, design notes, profiling recipes, tests.

## Core Components
### DeviceHost
- Wraps adapter/device acquisition, limit negotiation, device loss recovery.
- Emits lifecycle events (`onInit`, `onLost`, `onRecovered`).
- Stores shared GPU queue references and feature flags.

### SurfaceManager
- Configures canvas context; reacts to DPI/resize changes.
- Supplies color/depth attachment views per frame.
- Provides hooks for custom swap chain formats.

### RenderGraph
- Declarative description of render passes and compute stages.
- Nodes list inputs/outputs (texture views, buffers); edges enforce ordering.
- Supports cached render bundles when node payload is static.

### ResourceRegistry
- Centralized creation and tracking of GPU resources.
- Reference counts or explicit dispose APIs to prevent leaks.
- Optional debug labeling and serialization for tooling.

### TextMSDF Module
- Font loader (extends current `MsdfTextRenderer.createFont`, supports multi-page atlases).
- Layout service producing glyph runs with alignment options.
- Renderer providing either pre-encoded bundles or direct draw calls based on client choice.
- Public API exposed via `modules/text/msdf.ts` with types for fonts, text nodes, formatting.

### SceneController
- Optional helper for samples: updates camera matrices, orchestrates per-frame logic.
- Coordinates with RenderGraph and SurfaceManager each frame.

## Data Flow (Frame)
1. `SceneController` updates simulation/camera state.
2. `RenderGraph` resolves nodes based on scene state and module contributions.
3. `SurfaceManager` provides swap chain views; depth buffer prepared.
4. Kernel encodes command buffers, executing text module render bundles and core passes.
5. Submission via `DeviceHost` queue; post-frame hooks run (stats collection, profiling).

## Extensibility Hooks
- Plugin interface for modules to register passes and resource needs.
- Event hooks (`beforePass`, `afterPass`) for profiling or debugging overlays.
- Configuration file (`config/kernel.json`) to toggle features (validation layers, logging).

## Testing Strategy
- Unit tests for module logic (text layout, matrix math).
- Integration harness that instantiates Kernel Core with mocked GPU interfaces where feasible.
- Visual regression suite capturing WebGPU screenshots (future, Phase 3).

## Tooling Integration
- Script to generate module documentation from TypeScript doc comments.
- Profiling toggle writing GPU timestamps into logs for analysis.
- CLI scaffolding (`npm run kernel:inspect`) to dump resource registries.

## Interface Sketches
```ts
export interface DeviceHostOptions {
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Partial<GPUSupportedLimits>;
  canvas?: HTMLCanvasElement;
  onError?: (error: Error) => void;
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
  init(options: DeviceHostOptions): Promise<DeviceHost>;
}

export interface SurfaceManagerConfig {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  format?: GPUTextureFormat;
  depthFormat?: GPUTextureFormat;
  sizeProvider?: () => { width: number; height: number };
}

export interface FrameContext {
  colorView: GPUTextureView;
  depthView?: GPUTextureView;
  presentationFormat: GPUTextureFormat;
  size: { width: number; height: number; devicePixelRatio: number };
}

export interface SurfaceManager {
  readonly format: GPUTextureFormat;
  readonly depthFormat?: GPUTextureFormat;
  configure(config: SurfaceManagerConfig): void;
  acquireFrame(): FrameContext;
  resize(): void;
  dispose(): void;
}
```

### Notes
- `DeviceHostFactory` abstracts async adapter/device negotiation so tests can supply fakes.
- `SurfaceManager.acquireFrame` encapsulates canvas configuration and texture view creation per frame.
- `FrameContext` flows into the RenderGraph builder along with camera data.

## Open Questions
- Should RenderGraph support compute passes in Phase 1 or defer?
- How to abstract WGSL shader modules for tree-shaking-friendly builds?
- Best approach for handling async resource loading (promises vs. streaming)?
- Where to plug in AI-assisted refactor tools without risking subtle GPU bugs?

## Next Steps
- Prototype `DeviceHost` + `SurfaceManager` scaffolding with existing sample (see src/kernel/deviceHost.ts and src/platform/surfaceManager.ts stubs).
- Define TypeScript interfaces for module registration.
- Vet RenderGraph requirements against Phase 0 findings and baseline metrics.
- Align testing approach with repo tooling (vitest/jest?) before heavy implementation.

