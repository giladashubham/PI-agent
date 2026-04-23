# Pi Agent Custom Bundle

A custom Pi package repository with curated extensions, themes, and a web-fetch tool.

This repository is organized for production maintenance and open-source collaboration.

## What this repo contains

- Runtime extensions (`extensions/**`)
  - core UI + env loader
  - lightweight `/plan` mode
  - custom system prompt policy
- Web fetch tool (`tools/web-fetch/**`)
- Shared utilities (`src/shared/**`)
- Bundled themes (`themes/**`)

## Repository layout

```text
.
├── extensions/
│   ├── core/
│   │   ├── env-loader.ts
│   │   └── ui/
│   │       ├── index.ts
│   │       ├── banner.ts
│   │       ├── changed-files.ts
│   │       ├── footer.ts
│   │       ├── input-editor.ts
│   │       └── nerd-fonts.ts
│   ├── modes/
│   │   └── plan/
│   │       ├── index.ts
│   │       ├── ask-questions-tool.ts
│   │       ├── bash-safety.ts
│   │       ├── plan-config.ts
│   │       ├── plan-prompts.ts
│   │       └── tool-sets.ts
│   └── policies/
│       └── custom-system-prompt.ts
├── tools/
│   └── web-fetch/
│       ├── index.ts
│       ├── core/
│       ├── config/
│       ├── ui/
│       ├── util/
│       └── extensions/
├── src/shared/
├── tests/
│   ├── unit/
│   │   ├── extensions/
│   │   ├── tools/
│   │   └── shared/
│   └── smoke.sh
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   ├── EXTENDING.md
│   ├── RELEASE.md
│   └── reference/
│       └── config.md
└── package.json
```

## Install

```bash
./install.sh
```

This will:

- sync the package into `~/.pi/agent/packages/<package-name>` (excluding `.git` and `node_modules`)
- install npm dependencies in that installed package directory
- register the installed package path in `~/.pi/agent/settings.json` under `packages`

This means runtime behavior no longer depends on your git checkout location.

Then restart Pi or run `/reload`.

### Dry run

```bash
./install.sh --dry-run
```

## Uninstall

```bash
./uninstall.sh
```

By default this:

- removes package registration from `~/.pi/agent/settings.json`
- removes the installed package directory under `~/.pi/agent/packages/<package-name>`

Use `./uninstall.sh --keep-files` to unregister only and keep installed files.

### Dry run

```bash
./uninstall.sh --dry-run
```

## Optional target config directory

By default scripts target:

- `~/.pi/agent/settings.json`
- `~/.pi/agent/packages/`

Override agent root with:

```bash
PI_AGENT_DIR=/path/to/.pi/agent ./install.sh
```

## Configuration

Bundle-specific settings live in:

- `~/.pi/agent/pi-agent-custom.json`

Supported keys used by this bundle:

- `planMode` — plan mode model/thinking profiles
- `webFetch` — web-fetch model/timeouts/extensions settings
- `ui.banner` — custom core UI preference

See full reference:

- `docs/reference/config.md`

Theme selection uses Pi native theme support via `/settings` or `settings.json.theme`.
Bundled themes from this package remain available through `package.json#pi.themes`.

## Plan mode

Plan mode is question-first and markdown-first:

- `ask_questions` is always available (normal mode + plan mode)
- `/plan on` switches to read-only planning tools and plan-focused prompting
- `/plan off` restores normal tool access and model profile
- plans are rendered inline as markdown (no automatic plan artifact file)

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

## Documentation index

- `docs/ARCHITECTURE.md` — runtime architecture and ownership
- `docs/CONVENTIONS.md` — placement/naming/testing standards
- `docs/EXTENDING.md` — extension and tool authoring guide
- `docs/reference/config.md` — config keys, defaults, and precedence
- `docs/ROADMAP.md` — structure and production-readiness roadmap status
- `CONTRIBUTING.md` — local dev + PR expectations
- `SECURITY.md` — security policy

## License

MIT — see [LICENSE](./LICENSE).
