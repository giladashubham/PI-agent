# Pi Agent Custom Bundle

A custom Pi package repository with curated extensions and a web-fetch tool.

This repo is organized for maintainability (similar high-level style to larger Pi package repos), while preserving current behavior.

## What this repo contains

- **Extensions** for env loading, UI, planning workflow, and prompt behavior
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
├── plans/
├── tests/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   └── RELEASE.md
├── CONTRIBUTING.md
├── SECURITY.md
├── install.sh
├── uninstall.sh
└── package.json
```

See:

- `docs/ARCHITECTURE.md` for runtime architecture and flow
- `docs/CONVENTIONS.md` for placement/naming/testing standards
- `CONTRIBUTING.md` for local development workflow
- `docs/RELEASE.md` for versioning and release checklist

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

## Global .env loading

This bundle includes an env-loader extension that reads, on startup:

- `~/.pi/agent/.env`

Loaded variables are injected into `process.env` (existing shell env vars are not overwritten).

## Custom bundle config file

Bundle-specific settings live in:

- `~/.pi/agent/pi-agent-custom.json`

Current keys used by this bundle:

- `planMode` — plan mode model/thinking profiles
- `webFetch` — web-fetch model/timeouts/extensions settings
- `ui.banner` — custom core UI preference

Theme selection uses Pi's native theme support via `/settings` or `settings.json.theme`. Bundled themes from this package remain available through `package.json#pi.themes`.

## Plan mode model/thinking config

Plan mode supports per-phase model + thinking configuration via:

- `~/.pi/agent/pi-agent-custom.json` under `planMode`

Example:

```json
{
  "planMode": {
    "defaults": {
      "thinkingLevel": "high"
    },
    "plan": {
      "model": "openai-codex/gpt-5.4"
    }
  }
}
```

Resolution order for the plan phase:

1. `plan.*`
2. `defaults.*`
3. keep current session value

Allowed `thinkingLevel` values:

- `off`, `low`, `medium`, `high`, `xhigh`

Notes:

- Use `provider/model-id` for model names when possible.
- On manual `/plan off`, previous model/thinking (before plan mode) is restored.
- Legacy `~/.pi/agent/plan-mode.json` is still read as a fallback when `pi-agent-custom.json.planMode` is absent.
- `settings.json.planMode` is also accepted as a compatibility fallback.

## Plan mode

Plan mode is question-first and markdown-first:

- `ask_questions` is always available (normal mode and plan mode)
- `/plan on` switches to read-only planning tools and plan-focused prompting
- `/plan off` restores normal tool access and model profile
- plans are rendered directly in the assistant response as markdown
- if the user wants the plan written to disk, the agent can use normal file tools and a user-specified path

Commands:

- `/plan` — Toggle plan mode
- `/plan on` — Enable plan mode
- `/plan off` — Disable plan mode
- `/plan <task>` — Enable plan mode with a task
- `Ctrl+Alt+P` — Toggle plan mode shortcut

## Development quality gates

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:smoke
npm run test:ci
```

## Notes

- Pi extension entrypoints are declared in root `package.json` under `pi.extensions`.
- `tools/web-fetch/index.ts` is the active web-fetch entrypoint.
- Legacy pre-reorg paths were removed; use structured folders as the source of truth.

## License

MIT — see [LICENSE](./LICENSE).
