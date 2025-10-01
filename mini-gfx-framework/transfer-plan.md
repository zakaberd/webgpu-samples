# Sample Transfer Plan

## Objective
Create a self-contained `mini-gfx-framework` sandbox that can showcase multiple WebGPU demos (`msdfText`, `multipleCanvases`, `computeBoids`, `points`, `transparentCanvas`) without relying on files outside the `mini-gfx-framework/` tree. The sandbox should expose a clean scene selector UI and share common device/surface management code where practical.

## Current State Overview
- **Sandbox entry (`sandbox/main.ts`)** bootstraps a single MSDF text demo using `defaultDeviceHostFactory` and `CanvasSurfaceManager`.
- **Utilities** (`sandbox/util.ts`) already mirror `sample/util.ts`, so error handling hooks are available locally.
- **Assets present**: cube mesh and shaders required by the current MSDF scene. Other shared meshes/shaders still live under the repository root (`/meshes`, `/shaders`).
- **Build tooling**: Vite + TypeScript. Shader modules are currently loaded via `fetchShader(...)` helper or `?raw` imports.

## Sample Analysis & Migration Notes
- **msdfText (already ported)**
  - Uses `CanvasSurfaceManager` abstractions and custom text renderer module.
  - Dependence on `sandbox/assets/font/` is localized.
- **multipleCanvases**
  - Relies on custom mesh normalization (`models.ts`) pulling from global meshes (`meshes/teapot`, `meshes/stanfordDragon`, `meshes/sphere`).
  - Creates ~200 `<canvas>` elements with per-canvas pipelines, depth textures, and observers; needs DOM scaffolding and responsive resizing.
  - Shader: `solidColorLit.wgsl`.
- **computeBoids**
  - Requires two WGSL shaders (`sprite.wgsl`, `updateSprites.wgsl`).
  - Optional GPU feature `timestamp-query`; falls back gracefully if unavailable.
  - Uses `dat.gui` for parameter sliders and live telemetry display.
- **points**
  - Imports four shader modules (two vertex + two fragment) and uses `mat4` math similar to existing scene.
  - UI toggles currently built with `dat.gui` (fixed size vs distance, textured vs solid, point size slider).
  - Uses `OffscreenCanvas` to bake an emoji texture at runtime.
- **transparentCanvas**
  - Shares the cube mesh + basic shaders already mirrored into the sandbox.
  - Requires alpha-premultiplied surface configuration and animated transform updates.

## Dependencies To Internalize
- Mesh data and helpers: `meshes/teapot.ts`, `meshes/stanfordDragon.ts`, `meshes/stanfordDragonData.ts`, `meshes/sphere.ts`, `meshes/utils.ts`, plus any referenced typings (e.g., `mesh.ts`).
- Shader sources: `sample/**/sprite.wgsl`, `updateSprites.wgsl`, `solidColorLit.wgsl`, `distance-sized-points.vert.wgsl`, `fixed-size-points.vert.wgsl`, `orange.frag.wgsl`, `textured.frag.wgsl`.
- UI tooling: replace `dat.gui` with a lightweight, framework-free control layer (HTML `<form>` + minimal CSS/JS) to keep the sandbox dependency-free.
- Scene-specific HTML/CSS fragments (e.g., grid layout for `multipleCanvases`).

## Proposed Sandbox Architecture
- Introduce a `sandbox/scenes/` directory containing one module per demo exporting a common interface:
  ```ts
  export interface SandboxScene {
    id: 'msdf-text' | ...;
    title: string;
    mount(root: HTMLElement): Promise<() => void | void>;
  }
  ```
  - `mount` receives a container where it can create canvases/UI and returns a cleanup callback.
  - Scene modules decide whether to reuse shared `defaultDeviceHostFactory` or manage raw WebGPU setup (needed for many-canvas rendering).
- Add a `sandbox/sceneRegistry.ts` that aggregates available scenes for the selector UI (supports lazy `import()` to avoid loading all shaders upfront).
- Refactor `sandbox/main.ts` to:
  1. Render a persistent layout (toolbar with dropdown or buttons + content region).
  2. Load the requested scene module (default to MSDF on first load) and handle disposal when switching.
  3. Provide shared helpers (device host factory, math utilities) via context object passed into scenes where beneficial.
- Provide a simple CSS theme to accommodate scenes with multiple canvases or overlay panels while keeping body/global styles neutral.

## Implementation Steps
1. **Bootstrap Documentation & Structure**
   - Create `sandbox/scenes/` directory and sketch scene interface/type definitions.
   - Move current MSDF logic into `scenes/msdfTextScene.ts` to serve as reference implementation.
   - Status: initial scaffolding complete - scene registry in place and MSDF demo migrated (2025-10-01).
2. **Build Scene Selector Shell**
   - Rewrite `sandbox/main.ts` to manage UI shell, scene lifecycle, and route hash/state (optional but useful for bookmarking).
   - Implement minimal controls UI component (`sandbox/ui/controls.ts`) for slider/toggle rendering to reuse across scenes replacing `dat.gui`.
3. **Port Supporting Assets**
   - Copy required meshes, utilities, and shaders into `sandbox/` (preserving attribution/comments).
   - Adjust imports to relative paths within sandbox; convert shader imports to `?raw` or explicit fetch helpers compatible with Vite.
4. **Adapt Each Scene**
   - **multipleCanvases**: encapsulate DOM scaffolding inside `mount`, reuse shared util for adapter/device checks, ensure Resize/IntersectionObservers cleaned up.
   - **computeBoids**: expose control panel using new UI helpers, opt-in to timestamp query via scene-level request passed to `defaultDeviceHostFactory`.
   - **points**: replace `dat.gui`, ensure OffscreenCanvas fallback (e.g., use `<canvas>` when not supported).
   - **transparentCanvas**: reuse shared cube assets; ensure surface configuration sets `alphaMode: 'premultiplied'` via `CanvasSurfaceManager` hook or direct context config.
5. **Testing & Verification**
   - Manual smoke test each scene in the selector (resize browser, toggle controls, switch scenes repeatedly).
   - Validate no network requests escape `mini-gfx-framework/` (check DevTools network panel).
   - Capture notes/screenshots for future regression comparison (optional but recommended).
6. **Cleanup & Documentation**
   - Document usage in `README` or sandbox-specific guide.
   - Note any deviations from original samples (UI differences, feature toggles) for transparency.

## Risks & Open Questions
- **Performance**: Rendering hundreds of canvases may stress the host if run inside a single-page selector; monitor for throttling when scenes remain active in background.
- **Device feature negotiation**: Need an ergonomic way for scenes to request additional features/limits without reinitializing the host each time.
- **Asset size**: Stanford dragon mesh is sizable; ensure copying it does not bloat build unnecessarily (may consider dynamic import or binary asset compression later).
- **UI Consistency**: Replacing `dat.gui` must preserve functionality while keeping implementation lightweight.

## Next Actions
- Review this plan with Carl to confirm scope/priority.
- Once approved, execute Step 1 (scene interface + folder restructure) and iterate through the implementation steps.
