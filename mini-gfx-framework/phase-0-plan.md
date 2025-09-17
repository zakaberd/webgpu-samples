# Phase 0 Execution Plan

## Purpose
Phase 0 establishes a clean sandbox of the current `textRenderingMsdf` sample, captures baseline behavior, and documents the environment so the new mini graphics kernel starts from a known-good reference.

## Objectives
- Mirror the original sample within `mini-gfx-framework/` without altering functionality.
- Record baseline visuals, performance, and device requirements.
- Catalog all external assets, shaders, and utilities relied upon by the sample.
- Produce documentation that future phases use for validation and onboarding.

## Milestones & Timeline
| Milestone | Target | Owner | Deliverable |
| --- | --- | --- | --- |
| Sandbox prepared | Week 1, Day 1 | Carl | Copied assets, scripts, shaders under `mini-gfx-framework/sandbox/` with notes. |
| Baseline captured | Week 1, Day 2 | Carl | Screenshots, perf logs, error console transcript in `docs/baseline.md`. |
| Environment documented | Week 1, Day 3 | Carl + Codex | `docs/setup.md` covering dependencies, CLI commands, troubleshooting. |
| Dependency inventory reviewed | Week 1, Day 3 | Codex | Updated list merged into `system-study.md` and `docs/dependencies.json` if created. |
| Phase readiness review | Week 1, Day 4 | Carl | Sign-off checklist completed; kickoff notes for Phase 1. |

## Task Breakdown
### 1. Sandbox Asset Mirroring
- Create `mini-gfx-framework/sandbox/` directory structure mirroring `sample/textRenderingMsdf`.
- Copy HTML, TypeScript, WGSL, shader, and mesh assets; keep relative paths when possible.
- Record any implicit dependencies (for example, Vite or Rollup configs) encountered during copy.
- Track copy checklist in docs/phase-0/sandbox-log.md with file status (pending/in-progress/done) and issues.\n- Next: update sandbox entry point to bootstrap via new defaultDeviceHostFactory and CanvasSurfaceManager stubs.

### 2. Baseline Capture
- Run the sample locally via existing tooling (`npm run dev` or `npm run build && npm run serve`).
- Collect:
  - Screenshot of the cube with text overlays at 1080p.
  - GPU frame timing via browser devtools (Performance panel snapshot).
  - Console log output (clean run plus after forcing device loss via devtools, if possible).
- Store artifacts under `mini-gfx-framework/docs/baseline/` with timestamped filenames (`YYYYMMDD-hhmm-<artifact>.png/json`).
- Document capture steps, tooling versions, and observations in `docs/baseline.md`.

### 3. Environment Documentation
- Document prerequisites (Node version, browser flags, OS quirks).
- Note recommended VS Code extensions, lint or format commands, and build scripts.
- Include troubleshooting section covering common WebGPU issues (for example, adapter null).
- Maintain environment matrix in `docs/setup.md`, including OS/browser combinations tested.

### 4. Dependency Inventory
- Extend the `Sample Asset Inventory` table with:
  - Shared libraries such as `wgpu-matrix` and util helpers.
  - Shader pipeline settings (blend states, raster states).
  - Font generation tooling references.
- Serialize dependency metadata to `docs/dependencies.json`:
  ```json
  {
    "fonts": ["../../assets/font/ya-hei-ascii-msdf.json"],
    "shaders": [
      "../../shaders/basic.vert.wgsl",
      "../../shaders/vertexPositionColor.frag.wgsl",
      "msdfText.wgsl"
    ],
    "scripts": ["main.ts", "msdfText.ts"],
    "utilities": ["../util.ts", "wgpu-matrix"]
  }
  ```
- Link the JSON from `system-study.md` for quick cross-referencing.

### 5. Readiness Review
- Verify copied sandbox builds and runs without accessing original sample paths.
- Ensure documentation artifacts exist and are linked from `goals.md`.
- Summarize outstanding questions or risks before transitioning to Phase 1.
- Prepare `docs/phase-0/retrospective.md` capturing wins, blockers, and follow-up tasks.

## Inputs & Prerequisites
- Access to the original `sample/textRenderingMsdf` files.
- Working Node and npm environment matching the repo's `package.json` requirements.
- WebGPU-enabled browser (Chrome Canary or Edge with proper flags if needed).
- Disk space for duplicated assets and captured media.

## Tooling & Automation
- Prefer scriptable copy steps (PowerShell or Node scripts) to reduce manual error.
- Consider capturing baseline stats via the Performance API and storing JSON.
- Plan to add a simple `npm` task under `mini-gfx-framework/` for sandbox launch once assets are copied.

## Verification & Exit Criteria
- Sandbox version renders identically to original sample (visual inspection plus frame time tolerance +/-5 percent).
- Documentation (`docs/baseline.md`, `docs/setup.md`, `docs/phase-0/sandbox-log.md`) reviewed and checked into repo.
- Dependency list complete and cross-checked against runtime network requests.
- Phase 0 checklist in `goals.md` marked complete with notes.

## Risks & Mitigations
- **WebGPU flag drift**: Record exact browser version or flags; include fallback instructions.
- **Asset path mismatches**: Use automated diff to compare sandbox versus original file structures.
- **Time overruns**: Time-box baseline capture; prioritize must-have artifacts first.
- **Knowledge gaps**: Schedule quick AI or human review sessions mid-week to unblock.

## Deliverables
- `mini-gfx-framework/sandbox/` directory with functioning sample clone.
- Baseline documentation package in `mini-gfx-framework/docs/`.
- Updated references in `goals.md` and `system-study.md` pointing to new artifacts.
- Phase 0 readiness note (could become meeting notes or retrospective entry).

## Handoff to Phase 1
- Compile open questions in `docs/phase-1-prep.md` (to be created) covering kernel API requirements.
- Confirm that performance metrics and asset lists feed into architecture decisions documented in `architecture-outline.md`.

