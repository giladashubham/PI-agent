# Pi Agent Custom Bundle

A custom Pi package repository with curated extensions, skills, themes, and a web-fetch tool.

This repo is organized for maintainability (similar high-level style to larger Pi package repos), while preserving current behavior.

## What this repo contains

- **Extensions** for UI, planning workflow, model filtering, and prompt behavior
- **Skills** for reusable operating guidelines
- **Themes** (repo path reserved; currently empty)
- **Web fetch tool** implemented under `tools/web-fetch`

## Repository layout

```text
.
├── extensions/
│   ├── core/
│   ├── modes/
│   ├── policies/
│   └── providers/
├── tools/
│   └── web-fetch/
├── skills/
├── themes/
├── docs/
│   └── ARCHITECTURE.md
├── install.sh
├── uninstall.sh
└── package.json
```

See `docs/ARCHITECTURE.md` for ownership and path mapping.

## Install

```bash
./install.sh
```

This will:
- install npm dependencies
- register this repo path in `~/.pi/agent/settings.json` under `packages`

Then restart Pi or run `/reload`.

### Dry run

```bash
./install.sh --dry-run
```

## Uninstall

```bash
./uninstall.sh
```

This only removes this repo path from `~/.pi/agent/settings.json`.

### Dry run

```bash
./uninstall.sh --dry-run
```

## Optional target config directory

By default scripts target:

- `~/.pi/agent/settings.json`

Override with:

```bash
PI_AGENT_DIR=/path/to/.pi/agent ./install.sh
```

## Plan mode model/thinking config

Plan mode supports per-phase model + thinking configuration via:

- `~/.pi/agent/plan-mode.json`

Example:

```json
{
  "defaults": {
    "thinkingLevel": "high"
  },
  "plan": {
    "model": "openai/gpt-5.4"
  },
  "implement": {
    "model": "openai/gpt-codex-5.3",
    "thinkingLevel": "medium"
  }
}
```

Resolution order for each phase (`plan` or `implement`):
1. phase-specific value (`plan.*` or `implement.*`)
2. `defaults.*`
3. keep current session value

Allowed `thinkingLevel` values:
- `off`, `low`, `medium`, `high`, `xhigh`

Notes:
- Use `provider/model-id` for model names when possible.
- On manual `/plan off`, previous model/thinking (before plan mode) is restored.
- When selecting **Implement now** from plan mode, implement profile is applied.

## Notes

- Pi extension entrypoints are declared in root `package.json` under `pi.extensions`.
- `tools/web-fetch/index.ts` is the active web-fetch entrypoint.
- Legacy pre-reorg paths were removed; use structured folders as the source of truth.
