# Architecture Overview

## Purpose

This package is a **Pi bundle** that ships:

- runtime extensions (`extensions/**` + tool entrypoints)
- themes (`themes/**`)

Design goals:

1. **Clean ownership boundaries** (core UI vs modes vs policies vs tools)
2. **Single source of truth** for runtime entrypoints (`package.json#pi.extensions`)
3. **No legacy wrappers** in runtime paths
4. **Small, composable modules** over monolithic files

## Runtime composition

Pi loads resources from `package.json`:

- Extensions:
  - `extensions/core/env-loader.ts`
  - `extensions/core/ui/index.ts`
  - `extensions/modes/plan/index.ts`
  - `extensions/policies/custom-system-prompt.ts`
  - `tools/web-fetch/index.ts`
- Themes: `themes/`

## Directory ownership

## `extensions/core/`

Session UX surface.

- `env-loader.ts` — global env loading from `~/.pi/agent/.env`
- `ui/index.ts` — UI extension orchestrator
- `ui/banner.ts` — startup banner behavior
- `ui/footer.ts` — fixed footer rendering (dir/git + model/context/thinking)
- `ui/input-editor.ts` — input editor integration + ANSI border filtering
- `ui/changed-files.ts` — changed file widget

## `extensions/modes/plan/`

Lightweight plan mode modules.

- `index.ts` — `/plan` orchestration (`on|off|toggle|task`), prompt injection, tool shaping, bash safety gate
- `ask-questions-tool.ts` — always-available `ask_questions` tool
- `tool-sets.ts` — normal vs plan mode active tool lists
- `plan-prompts.ts` — plan-mode prompt and whitelist
- `bash-safety.ts` — read-only bash allowlist/denylist
- `plan-config.ts` — optional model/thinking profile apply/restore

## `extensions/policies/`

System-prompt policy injection.

- `custom-system-prompt.ts` — appends operating principles before agent runs

## `tools/web-fetch/`

Web-fetch tool with clear module boundaries:

- `index.ts` — Pi tool registration and top-level orchestration
- `core/`
  - `pipeline.ts` — fetch/extract/process pipeline
  - `runtime.ts` — browser fetch, extraction runner, sub-agent execution
  - `cache.ts` — TTL cache
  - `browser-pool.ts` — shared puppeteer browser/tab pool
  - `registry.ts` — URL pattern matching + extension priority
- `config/`
  - `model-selection.ts` — sub-agent model resolution
- `ui/`
  - `render.ts` — call/result rendering
  - `batch-format.ts` — batch result formatting
  - `batch-status.ts` — batch status data model
- `util/`
  - `url-utils.ts` — URL validation/normalization
  - `path-utils.ts` — path expansion helpers
- `extensions/*.ts` — built-in site-specific handlers
- `extension-loader.ts` — built-in/local/event-bus extension loading
- `types.ts` — extension and hook types

## `src/shared/`

Cross-domain shared utilities:

- `config.ts` — config file read/write/resolve helpers
- `paths.ts` — canonical path constants
- `types.ts` — shared types (plan mode profiles, thinking-level validation)
- `ansi.ts`, `formatting.ts` — formatting helpers

## Request lifecycle (high level)

1. Session starts
2. Extensions register commands/tools/hooks
3. User sends input
4. Mode/policy extensions mutate behavior via Pi events
5. Tool calls execute (parallel by default)
6. Results render in TUI

During `/plan`, the plan extension constrains active tools and applies the read-only bash safety gate.

## Web-fetch pipeline

`tools/web-fetch/index.ts` delegates to `core/pipeline.ts`.

Pipeline stages:

1. validate URL
2. cache lookup
3. optional `beforeFetch` hook
4. fetch HTML (puppeteer)
5. optional `afterFetch` hook
6. extract markdown (trafilatura)
7. optional `afterExtract` hook
8. cache write
9. return raw markdown or summarize with sub-agent

Batch mode runs this per URL concurrently with status updates.

## Production guardrails

- Type safety: `npm run typecheck`
- Static quality: `npm run lint`
- Unit tests: `npm run test:unit`
- Smoke tests: `npm run test:smoke`
- CI aggregate: `npm run test:ci`

See also `docs/CONVENTIONS.md` and `CONTRIBUTING.md`.
