# Transfer Log

## Purpose
Track ongoing work to consolidate selected WebGPU samples inside `mini-gfx-framework`, capture decisions, surface issues, and collect future enhancement ideas that flow from the transfer plan.

## Status Snapshot (2025-10-01)
- **Focus**: Planning integration of `multipleCanvases`, `computeBoids`, `points`, and `transparentCanvas` alongside existing `msdfText` scene.
- **Plan Reference**: See `transfer-plan.md` for the structured migration outline agreed today.

## Activity Log

### 2025-10-01
- Created initial transfer plan capturing architecture approach, asset migration needs, and risks.
- Established this log to serve as the living record for progress notes, design discussions, and blockers.
- Scaffolded scene infrastructure (scene registry, MSDF scene module) and updated sandbox shell to support future multi-scene selection.

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
- Carl to review plan + log and confirm priority order for scene ports.
- Kick off Step 1 from `transfer-plan.md`: scaffold `sandbox/scenes/` and migrate the MSDF demo into the new structure.
