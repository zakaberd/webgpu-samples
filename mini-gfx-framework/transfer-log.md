# Transfer Log
TEST
## Purpose
Track ongoing work to consolidate selected WebGPU samples inside `mini-gfx-framework`, capture decisions, surface issues, and collect future enhancement ideas that flow from the transfer plan.

## Status Snapshot (2025-10-02)
- **Focus**: Integrating `transparentCanvas`, `multipleCanvases`, `computeBoids`, and `points` inside the sandbox while polishing shared UI tooling and cleanup fixes.
- **Plan Reference**: See `transfer-plan.md` for the structured migration outline agreed today.

## Activity Log

### 2025-10-01
- Created initial transfer plan capturing architecture approach, asset migration needs, and risks.
- Established this log to serve as the living record for progress notes, design discussions, and blockers.
- Scaffolded scene infrastructure (scene registry, MSDF scene module) and updated sandbox shell to support future multi-scene selection.

### 2025-10-02
- Ported the `transparentCanvas` sample into `sandbox/scenes/transparentCanvasScene.ts`, reusing the shared device host and surface abstractions.
- Extended `CanvasSurfaceManager` / `defaultDeviceHostFactory` to forward `alphaMode`, enabling premultiplied surfaces for transparency-focused scenes.
- Refreshed the sandbox shell stylesheet to showcase transparent rendering over a gradient/text backdrop and added the new scene to the selector UI.
- Attempted a `vite build`; blocked by the repo's Node.js 19.8.1 runtime (Vite now requires 20.19+), so local type-check feedback is pending an engine upgrade.
- Completed the multi-scene `multipleCanvases` port inside `sandbox/scenes/multipleCanvasesScene.ts`, mirroring the 200-canvas storefront layout with resize/intersection observers and robust cleanup semantics.
- Localised required meshes (`teapot`, `stanfordDragon`, `sphere` variants) and shader sources under `sandbox/`, embedding the teapot geometry directly to eliminate the external package dependency.
- Added grid/product styling rules to `sandbox/index.html` so the new scene coexists cleanly with existing demos in the selector shell.
- Introduced a reusable controls panel component (`sandbox/ui/controls.ts`) with shared styling to replace `dat.gui` across sandbox scenes.
- Ported `computeBoids` to `sandbox/scenes/computeBoidsScene.ts`, including timestamp-query fallback logic, stats overlay, and parameter editing via the new controls panel.
- Copied compute shaders into `sandbox/shaders/computeBoids/` and wired the scene into the selector.
- Updated device teardown paths to suppress expected `device.lost` events during scene switches.
- Clamped WebGPU surface resizing to avoid zero-size textures and ensured scenes trigger an initial layout pass.
- Ported the `points` sample (`sandbox/scenes/pointsScene.ts`) with localized WGSL shaders, new controls, and emoji texture fallback handling.

## Ideas & Opportunities
- Build a lightweight scene lifecycle helper that standardises surface/device sharing and cleanup hooks across demos.
- Consider lazy-loading heavy meshes (for example the Stanford dragon) to keep initial sandbox payload small.
- Explore a unified instrumentation overlay (FPS, timers) reusable by compute and render scenes.

## Issues & Risks to Watch
- Need a mechanism for scenes to request optional WebGPU features (`timestamp-query`) without forcing full host reinitialisation.
- Multiple active canvases may increase GPU/CPU load; investigate throttling or visibility-based pausing.
- Replacing `dat.gui` must preserve usability; success criteria should include accessibility and keyboard navigation.

## Future Considerations
- Document asset provenance and licensing details once meshes/shaders are copied so the sandbox remains audit-friendly.
- Evaluate sharing math/util modules between sandbox scenes and framework core to avoid duplication.
- Plan for automated smoke tests (headless or screenshot-based) after scenes land to protect against regressions.

## Questions / Follow-ups
- Should scene selection state be bookmarkable via URL hash, or is session-scoped state sufficient?
- Are there additional samples we anticipate wanting soon (so we can keep abstractions flexible)?

## Next Steps
- Carl to review compute + points scene behaviour and decide on any additional refinements (texture asset choices, animation pacing).
- Resolve remaining TypeScript warnings surfaced during `npm run build` (`deviceHost.ts` requiredLimits/GPUError typing, `vite.config.ts` preview options).
- Audit package-lock changes introduced during Node/npm upgrades before polishing documentation and final cleanup.
