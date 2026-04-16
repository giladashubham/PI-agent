# Architecture Overview

## Purpose

This package is a **Pi bundle** that ships:

- runtime extensions (`extensions/**` + tool entrypoints)
- reusable skills (`skills/**`)
- optional themes (`themes/**`)

Design goals:

1. **Clean ownership boundaries** (UI vs mode vs policy vs provider vs tools)
2. **Single source of truth** for extension entrypoints (`package.json#pi.extensions`)
3. **No legacy wrappers** or backward-compat shims in the runtime path

## Runtime composition

Pi loads resources from `package.json`:

- Extensions:
  - `extensions/core/custom-core-ui.ts`
  - `extensions/modes/question-first-plan-mode.ts`
  - `extensions/policies/karpathy-guidelines.ts`
  - `extensions/providers/opencode-free-models.ts`
  - `tools/web-fetch/index.ts`
- Skills: `skills/`
- Themes: `themes/`

## Directory ownership

## `extensions/core/`

Session UX surface: status/footer/banner/theme controls.

## `extensions/modes/`

Conversation-flow control and operational mode behavior.

## `extensions/policies/`

Prompt-level behavioral constraints and operating principles.

## `extensions/providers/`

Model/provider policy (e.g., model filtering and enforcement).

## `tools/web-fetch/`

Web fetching tool implementation and internal modules:

- `index.ts` — orchestration + Pi tool registration
- `pipeline.ts` — fetch/extract/process orchestration pipeline
- `render.ts` — tool call/result and batch status rendering
- `model-selection.ts` — sub-agent model resolution strategy
- `runtime.ts` — fetch/extract/sub-agent runtime primitives
- `cache.ts` — TTL cache lifecycle
- `extension-loader.ts` — built-in/local/event-bus extension loading
- `registry.ts` — URL pattern matching + extension priority
- `url-utils.ts`, `path-utils.ts`, `batch-format.ts`, `batch-status.ts` — focused helpers
- `extensions/*.ts` — built-in site handlers

## `skills/`

Agent Skills compliant definitions (`<skill>/SKILL.md`).

## `themes/`

Optional Pi TUI theme definitions.

## Request lifecycle (high level)

1. Session starts
2. Extensions register commands/tools/hooks
3. User sends input
4. Mode/policy/provider extensions mutate behavior via Pi events
5. Tool calls execute (parallel by default)
6. Results render in TUI

`question-first-plan-mode` further constrains active tools and prompt behavior during planning.

## Web fetch pipeline

`tools/web-fetch/index.ts` is the runtime entrypoint and delegates execution to `pipeline.ts`.

Pipeline stages:

1. validate URL
2. cache lookup
3. optional site hook (`beforeFetch`)
4. fetch HTML (Puppeteer via shared browser pool)
5. optional `afterFetch` hook
6. extract markdown (trafilatura)
7. optional `afterExtract` hook
8. cache write
9. return raw markdown or summarize via sub-agent

Batch mode runs this per URL concurrently with status reporting.

## Web-fetch module dependency diagram

```text
index.ts
 ├─ model-selection.ts
 ├─ extension-loader.ts
 ├─ cache.ts
 ├─ pipeline.ts
 │   ├─ runtime.ts
 │   ├─ url-utils.ts
 │   ├─ types.ts
 │   ├─ batch-format.ts
 │   └─ batch-status.ts
 └─ render.ts
     └─ batch-status.ts
```

## Production guardrails

- Type safety: `npm run typecheck`
- Static quality: `npm run lint`
- Unit tests: `npm run test:unit`
- Smoke tests: `npm run test:smoke`
- CI aggregate: `npm run test:ci`

See also `docs/CONVENTIONS.md` and `CONTRIBUTING.md`.
