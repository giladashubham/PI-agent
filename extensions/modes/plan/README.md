# Plan Mode (Plan-lite)

This directory contains the lightweight plan-mode building blocks used by `question-first-plan-mode.ts`.

## Goals

- Keep `/plan on|off` behavior simple and predictable.
- Keep `ask_questions` always available (normal mode and plan mode).
- Use prompt behavior for planning output (markdown in assistant response).
- Keep optional safety and profile features modular.

## Modules

- `ask-questions-tool.ts`
  - Registers `ask_questions` once.
  - Interactive multi-question UI with optional review/edit before submit.

- `tool-sets.ts`
  - Computes normal-mode vs plan-mode active tools.
  - Ensures `ask_questions` is always present when available.

- `plan-prompts.ts`
  - Plan-mode system prompt snippet.
  - Plan-mode whitelist for `setActiveTools`.

- `bash-safety.ts`
  - Read-only bash safety policy used in `tool_call` while `/plan` is enabled.

- `plan-config.ts`
  - Optional model/thinking profile apply/restore helpers for `/plan on|off`.

## Integration

`extensions/modes/question-first-plan-mode.ts` is the orchestrator:

1. toggles mode (`/plan on|off`)
2. applies tool sets
3. appends plan prompt when enabled
4. enforces bash safety
5. restores previous profile on mode off

This split keeps behavior explicit and makes the extension easier to evolve as open-source code.
