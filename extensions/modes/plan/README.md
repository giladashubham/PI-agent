# Plan Mode (plan-lite)

This directory contains the lightweight plan-mode modules used by `extensions/modes/plan/index.ts`.

## Goals

- Keep `/plan on|off` behavior simple and predictable
- Keep `ask_questions` always available (normal + plan mode)
- Use prompt behavior for planning output (inline markdown)
- Keep safety/profile features modular

## Modules

- `index.ts`
  - Orchestrator for `/plan`, `/plan on`, `/plan off`, `/plan <task>`
  - Restores persisted mode state and active tools
  - Injects plan-mode prompt and bash safety gate

- `ask-questions-tool.ts`
  - Registers `ask_questions` once
  - Interactive multi-question flow with optional review/edit

- `tool-sets.ts`
  - Computes normal-mode vs plan-mode active tools
  - Ensures `ask_questions` stays available when present

- `plan-prompts.ts`
  - Plan-mode system prompt snippet
  - Plan-mode tool whitelist

- `bash-safety.ts`
  - Read-only bash policy used while `/plan` is active

- `plan-config.ts`
  - Optional model/thinking profile apply/restore helpers

This split keeps behavior explicit and easy to maintain.
