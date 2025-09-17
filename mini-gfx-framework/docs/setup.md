# Development Environment Setup

Record the environment assumptions for running the sandbox and future kernel work.

## Prerequisites
- Node.js version: TBD (check `package.json` engines)
- npm version: TBD
- Supported browsers: Chrome Canary (version TBD), Edge (version TBD)
- OS targets: Windows 11, macOS Ventura, Linux (distro TBD)

## Installation Steps
1. Run `npm install` at repo root.
2. Enable required WebGPU flags (document specifics per browser).
3. Launch dev server with `npm run dev` (confirm command in repo docs).
4. Access sandbox sample at `http://localhost:<port>/mini-gfx-framework/sandbox/` (adjust once established).

## Tooling
- Recommended VS Code extensions: WebGPU tools, ESLint, Prettier.
- Optional profiling tools: Chrome Performance panel, WebGPU capture.

## Troubleshooting
- Adapter null: verify WebGPU flag and GPU driver versions.
- Device lost errors: capture logs and attach to `docs/baseline.md` entry.
- Shader compilation issues: check WGSL file paths and build step.

## Tested Configurations
| OS | Browser | Status | Notes |
| --- | --- | --- | --- |
| | | pending | |

Update this file as the environment evolves during Phase 0.


## Running the Sandbox
- Dev server: 
pm run dev (defaults to http://localhost:5173/).
- Build assets: 
pm run build (outputs to mini-gfx-framework/dist).
- Preview production build: 
pm run preview.

