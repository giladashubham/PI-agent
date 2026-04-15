# Architecture Overview

## Goal

Keep the repo easy to navigate by grouping entrypoints by responsibility:

- UI/session experience
- planning workflow
- behavior/policy injection
- model/provider behavior
- tool integrations

## Active Pi entrypoints

Configured in `package.json`:

- `extensions/core/custom-core-ui.ts`
- `extensions/modes/question-first-plan-mode.ts`
- `extensions/policies/karpathy-guidelines.ts`
- `extensions/providers/opencode-free-models.ts`
- `tools/web-fetch/index.ts`

Skills and themes are loaded from:

- `skills/`
- `themes/`

## Directory ownership

### `extensions/core/`
UI/UX and session-surface behavior.

### `extensions/modes/`
Operational workflow modes and flow control.

### `extensions/policies/`
System-prompt policy addendums and behavior guardrails.

### `extensions/providers/`
Provider/model-selection logic and provider-specific constraints.

### `tools/web-fetch/`
Tool-facing entrypoint for web fetch.

## Cleanup status

Legacy pre-reorg paths have been removed.

Canonical source locations are now only:

- `extensions/core/*`
- `extensions/modes/*`
- `extensions/policies/*`
- `extensions/providers/*`
- `tools/web-fetch/*`

## How to extend

- Add new extension entrypoints under the appropriate `extensions/<domain>/` folder.
- Register them in root `package.json` (`pi.extensions`).
- Keep cross-domain shared helpers close to the owning domain unless reuse is proven.
