# AI Collaboration Guide

## Goals
- Accelerate research, refactoring, and documentation without compromising design intent.
- Maintain human oversight on architectural decisions and final API shapes.
- Capture reusable prompts and workflows to reduce future friction.

## Collaboration Cadence
| Phase | Engagement | Focus |
| --- | --- | --- |
| Phase 0 | Daily micro-sessions (15 min) | Sandbox setup support, documentation polishing, dependency tracing. |
| Phase 1 | Design sessions at start and end of each sprint block | Kernel API brainstorming, code review assistance, test suggestions. |
| Phase 2 | Paired debugging sessions as needed | Shader refactors, performance tuning, spec clarification. |
| Phase 3 | Editorial plus audit passes | Tutorial writing, changelog prep, retrospective synthesis. |

## Roles & Responsibilities
- **Carl**: Define goals, review AI outputs, integrate final decisions, maintain repository history.
- **Codex (AI)**: Provide research summaries, draft code or doc changes, surface risks, suggest tests.
- **Review Partner** (optional human peer): Validate critical changes, co-own retrospectives.

## Request Playbook
1. **Frame the task**: Include file paths, desired end state, constraints (performance, style).
2. **Provide context**: Link relevant sections (`goals.md`, `system-study.md`, baseline metrics).
3. **Define validation**: Specify how success will be measured (tests run, visual compare, doc review).
4. **Review and merge**: Human reviews AI output, applies edits, and records rationale in design notes.

## Session Logging Process
1. Create a new file under `docs/ai-sessions/` using the naming convention `YYYYMMDD-topic.md`.
2. Copy the template from `docs/ai-sessions/README.md` and fill in participants, focus, key decisions, and action items.
3. Link relevant artifacts (PRs, documents, benchmarks) in the session file.
4. Update `goals.md` or phase plans with decisions that affect roadmap items.

## Prompt Templates
- **Design Brainstorm**: "Outline options for `<component>` considering constraints `<list>`. Compare trade-offs and recommend."
- **Refactor Request**: "Refactor `<file>` to achieve `<goal>`; preserve behavior verified by `<tests>`. Provide diff summary and testing plan."
- **Doc Polish**: "Improve clarity of `<section>` for audience `<profile>`; highlight missing context or examples."
- **Risk Assessment**: "Audit `<feature>` for failure modes, performance bottlenecks, and testing gaps."

## Quality Safeguards
- Require human sign-off on:
  - Public API surface changes.
  - Shader logic updates affecting rendering output.
  - Performance optimizations altering resource usage.
- Log AI-assisted changes in `docs/ai-sessions/` with date, scope, acceptance criteria.
- Maintain diff discipline: keep AI-generated patches scoped and reviewable.

## Tooling & Tracking
- Use git branches prefixed with `ai/` for collaborative experiments.
- Store meeting notes or transcripts in `docs/ai-sessions/` per session.
- Tag open questions in issues with `needs-ai-input` to queue future sessions.

## Communication Norms
- Prefer asynchronous updates via PR descriptions and doc notes.
- Call out uncertainties explicitly; AI should propose validation strategies when unsure.
- Keep conversations grounded in measurable outcomes (benchmarks, test results).

## Escalation Plan
- If AI output seems off (contradictory, high risk), pause and request deeper explanation or alternative approach.
- For blocked tasks longer than one day, schedule a dedicated deep-dive session with explicit objectives.

## Continuous Improvement
- After each phase, run a short retrospective on AI collaboration effectiveness.
- Update this guide with new prompt templates, pitfalls, or best practices discovered during the project.
