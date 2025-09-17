# textRenderingMsdf System Study

## Purpose
Document how the existing `sample/textRenderingMsdf` demo works so we can recreate and evolve it inside the mini graphics kernel. The goal is to capture the what/where/how/why behind the current implementation before refactoring.

## Related Documents
- `goals.md` - Program-level objectives, roadmap, and success criteria.
- `phase-0-plan.md` - Execution playbook for establishing the sandbox baseline.
- `architecture-outline.md` - Target kernel structure that this study will inform.
- `ai-collaboration-guide.md` - Collaboration cadence when expanding on these findings.

## High-Level Behavior
- Boots a WebGPU context, renders a rotating cube, and overlays multiple MSDF text elements, including a scrolling block of informational text.
- Uses a shared camera for both cube geometry and text quads to keep the scene coherent.
- Keeps the original sample structure (HTML entry, TypeScript main file, utility helpers, shared shader assets) to align with the wider WebGPU samples project.

## Execution Flow
1. `index.html` creates a `<canvas>` and loads `main.ts` as a module.
2. `main.ts` acquires a GPU adapter/device (guarded by `quitIfWebGPUNotAvailable`) and configures the WebGPU canvas context.
3. A `MsdfTextRenderer` instance is created to manage MSDF fonts, camera updates, and render bundles.
4. The Ya Hei ASCII MSDF font JSON is fetched, parsed, and converted into GPU buffers/textures through `MsdfTextRenderer.createFont`.
5. Several text phrases are formatted into `MsdfText` objects, each backed by a GPU storage buffer and render bundle for instanced quad drawing.
6. Cube vertex data is uploaded, and a standard vertex/fragment pipeline (shared shaders) is built for the 3D geometry.
7. Per frame: matrices are updated, camera data broadcasts to both cube and text systems, draw calls encode into a command buffer, and render bundles execute to composite text over the cube.

## Module Inventory
| Path | Responsibility | Key Exports/Side Effects | Why It Matters |
| --- | --- | --- | --- |
| `sample/textRenderingMsdf/index.html` | Bootstraps canvas and loads module scripts. | `<canvas>` element, `<script type="module">` for `main.ts`. | Provides the DOM environment we must replicate in the new framework. |
| `sample/textRenderingMsdf/main.ts` | Coordinates WebGPU setup, cube rendering, and text formatting. | Creates device, pipelines, uniforms, render loop; uses `MsdfTextRenderer`. | Defines overall control flow and shows how text + 3D share camera state. |
| `sample/textRenderingMsdf/msdfText.ts` | Implements MSDF font loading, text layout, render bundle generation, and camera buffer updates. | Classes `MsdfTextRenderer`, `MsdfFont`, `MsdfText`; helpers `measureText`. | Encapsulates text-specific GPU resources we need to modularize in the new kernel. |
| `sample/textRenderingMsdf/msdfText.wgsl` | Shader code for instanced text quads with MSDF sampling. | `vertexMain`, `fragmentMain`, data layout definitions. | Sets GPU interface contracts (bind groups, uniforms, vertex formats) for MSDF rendering. |
| `sample/textRenderingMsdf/meta.ts` | Metadata consumed by the sample gallery. | Demo name, description, source list. | Not strictly required for the new kernel but useful for documentation context. |
| `meshes/cube.ts` | Provides cube vertex data and constants. | `cubeVertexArray`, stride/offset constants. | Demonstrates how geometry helpers plug into the sample. |
| `shaders/basic.vert.wgsl` & `shaders/vertexPositionColor.frag.wgsl` | Shared shaders for the rotating cube. | Vertex transform and fragment color logic. | Represent reusable shader assets we may port or replace. |
| `sample/util.ts` | Browser/device assertion helpers and error reporting. | `quitIfWebGPUNotAvailable`, `quitIfLimitLessThan`, runtime error dialogs. | Safety guards we may want to preserve or streamline in our framework. |

## Data & Asset Flow
- **Font JSON**: `../../assets/font/ya-hei-ascii-msdf.json` describes glyph metrics, atlas pages, and kerning pairs. Parsed to create GPU storage buffers and text layout metadata.
- **Font Atlas Texture**: Loaded via `fetch`/`createImageBitmap` inside `loadTexture`, copied into an `rgba8unorm` texture; currently assumes a single page.
- **Text Buffers**: Each formatted string allocates a GPU storage buffer sized to `printedCharCount + control data`. Buffer holds per-character offsets and glyph indices.
- **Camera Uniform Buffer**: Shared across all text instances (`cameraUniformBuffer`) and updated every frame via `updateCamera`.
- **Render Bundles**: Pre-encoded draw bundles per text string to minimize per-frame command encoding overhead for text.

## Text Layout Behavior
- `MsdfTextRenderer.formatText` reserves the first 24 floats of each text buffer for transform, color, and pixel scale data managed by `MsdfText` before writing glyph instances.
- When `centered: true`, the renderer calls `measureText` twice: once to capture widths for every line, then again to emit glyph positions with a per-line offset computed from the overall block width and the specific line width (`lineOffset = blockWidth * -0.5 - (blockWidth - lineWidth) * -0.5`).
- Newline (LF) characters trigger a line break, push the current width into `lineWidths`, advance the y offset by `lineHeight`, and intentionally fall through to carriage return handling (no extra action). Spaces simply advance the x offset without adding an instance.
- Kerning data is stored in a nested `Map<number, Map<number, number>>`; when present the layout looks up the second character and adds the kerning adjustment to the `xadvance` for smoother spacing.
- `MsdfText.getRenderBundle` lazily writes transforms/colors into the GPU buffer when flagged dirty, allowing transforms to be updated per frame without re-encoding render bundles.

## Device and Context Bootstrapping Insights
- **Common steps across samples**: `helloTriangle` and `renderBundles` mirror the MSDF sample by requesting a compatibility adapter, calling `quitIfWebGPUNotAvailable`, configuring the canvas with `devicePixelRatio`, and using `navigator.gpu.getPreferredCanvasFormat()` before queue submission.
- **MSDF-specific quirks**: adds `quitIfLimitLessThan` checks to raise `requiredLimits` for storage buffers prior to `requestDevice`, ensuring font storage buffers work even on lower-tier hardware.
- **RenderBundles sample**: stays minimal on limits but layers GUI/stats logic after the shared bootstrapping block, suggesting our kernel should decouple optional tooling from device/context acquisition.
- **Takeaway**: a reusable kernel bootstrapper should expose knobs for optional limit negotiation, canvas sizing policy (e.g., DPR scaling), and post-configure hooks so both simple and complex samples can share the same foundation.

## Responsibility Mapping Toward the Mini Kernel
| Current Responsibility | Location in Sample | Target Kernel Component | Notes |
| --- | --- | --- | --- |
| Adapter/device negotiation, limit enforcement | `main.ts` + `util.ts` | `DeviceHost` | Needs options for limit overrides and error hooks. |
| Canvas configuration and resize policy | `main.ts` | `SurfaceManager` | DPR handling and swap chain updates should centralize here. |
| Per-frame command encoding and submission | `main.ts` (`frame()` loop) | `RenderGraph` + `SceneController` | Graph should manage passes; scene controller updates transforms before submission. |
| Text layout, bundle encoding, camera sync | `msdfText.ts` | `TextMSDF` module | Split loader, layout service, and renderer for composability. |
| Geometry data provisioning | `meshes/cube.ts` | Geometry primitives library | Feed reusable primitives into future samples. |
| Shared shader source | `shaders/*.wgsl` | Material/shader catalog | Consolidate with metadata (entry points, pipeline descriptors). |
| Error dialogs and device loss handling | `util.ts` | Platform layer utilities | Wrap into standardized diagnostics hooks. |
| Asset loading (fonts, textures) | `msdfText.ts`, `main.ts` | Resource registry / loader services | Centralize async fetch + upload with caching. |

## GPU Pipeline Overview
- **Cube Pipeline**:
  - Vertex shader: `basic.vert.wgsl` (applies MVP matrix to cube vertices).
  - Fragment shader: `vertexPositionColor.frag.wgsl` (uses vertex colors / UVs).
  - Depth testing enabled (`depth24plus`), backface culling enabled.
  - Uniform bind group 0 supplies the MVP matrix buffer.
- **MSDF Text Pipeline**:
  - Pipeline layout with two bind groups: font data (texture/sampler/glyph buffer) and text instance data (camera uniform plus per-string storage buffer).
  - Vertex stage generates quad vertices procedurally via `vertex_index` and per-instance glyph data.
  - Fragment stage uses signed distance field sampling and dynamic antialiasing (`dpdxFine`, `dpdyFine`).
  - Alpha blending (pre-multiplied behavior via `src-alpha`/`one-minus-src-alpha`) to composite text over the cube.

## Control & State Management
- **Matrix Math**: `wgpu-matrix` library handles mat4 operations; `getTransformationMatrix` updates cube rotation and text placement each frame.
- **Text Placement**: `textTransforms` array stores static transforms for labels on cube faces; large scrolling text uses time-based translation.
- **Device Limits**: Sample enforces `maxStorageBuffersInFragmentStage >= 1` and `maxStorageBuffersInVertexStage >= 2` before requesting the device.
- **Animation Loop**: `requestAnimationFrame` calls `frame`, updates buffers, encodes render pass, executes text render bundles, and submits the command queue.

## Observed Constraints & Assumptions
- Single font atlas page (`TODO` note indicates multi-page not yet supported).
- Text buffer size reserves space for 6 extra elements (`text.length + 6`), implying internal metadata requirements.
- Render bundle approach assumes static text per frame; dynamic strings would require re-encoding.
- MSDF antialiasing constant (`pxRange = 4`) hard-coded to match generator defaults.
- Relies on browser APIs (`fetch`, `createImageBitmap`) and DOM; porting to worker or Node contexts would need alternatives.

## Opportunities / Questions for New Design
- Can we abstract font loading to support multiple atlases and dynamic glyph streaming?
- Should camera handling live inside the kernel (shared matrices) rather than inside `MsdfTextRenderer`?
- How will we expose render bundle versus direct draw choices to framework users?
- What testing strategy captures visual regressions for MSDF output (for example, snapshot-based)?
- Do we keep the dependency on `wgpu-matrix`, or embed lightweight matrix utilities?
- How do we modularize shared shaders (`basic.vert.wgsl`, etc.) so multiple samples reuse them cleanly?

## Next Investigation Steps
- Follow `phase-0-plan.md` to capture baseline artifacts that validate these findings.
- Map each identified responsibility to proposed components in `architecture-outline.md`. **(Done)**
- Trace how `MsdfTextRenderer.measureText` interacts with formatting options during center alignment and multiline layout; document results here. **(Done)**
- Profile the runtime to understand buffer writes versus render bundle execution costs and feed metrics into the architecture plan.
- Explore how other samples structure device/context bootstrapping to identify reusable kernel patterns and note deviations. **(Done)**
- Start mapping desired API surface area for the future kernel against these identified responsibilities, coordinating with `goals.md` success criteria.
