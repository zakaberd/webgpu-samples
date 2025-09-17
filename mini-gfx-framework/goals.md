# Mini GFX Kernel Goals

## Vision
Create a tiny, opinionated WebGPU graphics kernel in this repo that reimagines the sample/textRenderingMsdf demo.
The end result should feel like a tutorial-quality codebase that also supports advanced experimentation.

## Success Criteria
- sample/textRenderingMsdf/index.html runs unchanged on top of the new kernel.
- Core rendering, resource management, and text layout APIs are documented and unit tested.
- Profiling shows equal or better performance than the original sample at target resolutions.
- A walkthrough guide explains how to extend the kernel with new effects or pipelines.

## Scope
- Extract and modernize only the pieces of the sample needed for text rendering.
- Design a modular architecture: core kernel, text systems, utilities, sample app layer.
- Provide developer ergonomics: consistent naming, inline docs, typed interfaces, tracing hooks.
- Package reusable helpers (shaders, buffer utils, render graph primitives) for future samples.

## Non-Goals
- Rebuilding every sample in the repository.
- Supporting legacy browsers or non-WebGPU backends.
- Shipping production-ready UI or asset tooling.

## Roadmap
**Phase 0 -- Project setup**
- Clone the sample HTML, assets, shaders, and scripts into mini-gfx-framework/.
- Document the baseline behavior, dependencies, and build/dev workflow.
- Exit criteria: sample builds and runs locally with no framework changes.

**Phase 1 -- Kernel foundation**
- Define the minimal device/context wrapper and lifecycle management.
- Establish command submission, swap chain handling, and render pass scaffolding.
- Exit criteria: clear API surface for initialization and per-frame updates; smoke test in place.

**Phase 2 -- Text rendering systems**
- Port MSDF font loading, atlas generation, and shader pipelines into modular components.
- Add focused unit tests for geometry generation and shader parameter binding.
- Exit criteria: text sample renders identically using the new kernel abstractions.

**Phase 3 -- Experience polish**
- Write tutorial-style documentation, diagrams, and code comments.
- Profile, tune hotspots, and capture before/after metrics.
- Exit criteria: documented benchmarks, published design notes, backlog of next experiments.

### Phase 0 Task Checklist
| Task | Owner | Target | Notes |
| --- | --- | --- | --- |
| Copy sample/textRenderingMsdf assets into mini-gfx-framework sandbox | Carl | Week 1, Day 1 | Preserve original paths for diffing. Track progress in `phase-0-plan.md`. |
| Capture baseline run (screenshots, perf metrics, console logs) | Carl | Week 1, Day 2 | Use existing tooling; store notes in docs/baseline.md. |
| Document setup workflow (deps, commands, pitfalls) | Carl + Codex | Week 1, Day 3 | Draft in docs/setup.md; AI assists with editing per `ai-collaboration-guide.md`. |
| Identify external dependencies (fonts, shaders, pipeline states) | Codex | Week 1, Day 3 | Produce dependency list for review and sync with `system-study.md`. |
| Review and sign off on Phase 0 readiness | Carl | Week 1, Day 4 | Confirm exit criteria met; schedule Phase 1 kickoff using `phase-0-plan.md` checklist. |

## Sample Asset Inventory
| File | Role | Key Dependencies | Notes |
| --- | --- | --- | --- |
| index.html | Sample entry point and canvas bootstrap | canvas element, module import of main.ts | Reference HTML to mirror in new kernel. |
| main.ts | Orchestrates WebGPU setup, cube scene, and text renderer | wgpu-matrix, ../../meshes/cube, ../../shaders/basic.vert.wgsl, ../../shaders/vertexPositionColor.frag.wgsl, ../util, MsdfTextRenderer | Loads font atlas ../../assets/font/ya-hei-ascii-msdf.json. |
| meta.ts | Demo metadata for sample browser | none | Contains links to source files for documentation. |
| msdfText.ts | Implements MSDF font loading, layout, render bundles | wgpu-matrix, msdfText.wgsl | Exposes MsdfTextRenderer, MsdfFont, measurement helpers. |
| msdfText.wgsl | WGSL shader implementing MSDF fragment/pipeline logic | Pipeline layout created in msdfText.ts | Requires MSDF uniforms and texture bindings. |

## Supporting Documentation
- `system-study.md` - Deep dive into the existing sample's behavior and dependencies.
- `phase-0-plan.md` - Detailed execution playbook, milestones, and checklists for Phase 0.
- `architecture-outline.md` - Proposed layering and component responsibilities for the new kernel.
- `ai-collaboration-guide.md` - Cadence, prompts, and safeguards for working with AI assistance.

## Technical Requirements
| Area | Requirement |
| --- | --- |
| Platform | Target latest Chrome/Edge WebGPU; support Windows/macOS dev environments |
| Tooling | Use existing build tooling where possible; document any new scripts |
| Testing | Include unit tests (font geometry, buffer updates) and visual regression snapshots |
| Performance | Maintain frame times within +/-5% of original sample at 1080p |
| Observability | Provide logging or tracing hooks for command submission and resource lifetimes |

## AI Collaboration Plan
- Use AI for brainstorming architecture variations, code reviews, and doc polishing.
- Request targeted refactoring help (for example, shader module extraction) and test suggestions.
- Keep final API decisions human-reviewed; capture rationale in design notes.
- Schedule periodic AI pair sessions before each phase to plan tasks and risks.
- Refer to `ai-collaboration-guide.md` for cadence, prompts, and quality gates.

## Quality Gates
- Every new module ships with API docs and example usage.
- Tests run green locally and in CI before merging.
- Profiling report captured at the end of each phase.
- Pull requests require peer review plus a short post-merge retrospective entry.

## Immediate Next Steps
- Follow `phase-0-plan.md` to kick off sandbox mirroring and baseline capture.
- Use `system-study.md` as the reference when inventorying assets and dependencies.
- Start sketching the kernel API using `architecture-outline.md` as guidance.
- Schedule the first AI pair session aligned with `ai-collaboration-guide.md` recommendations.

