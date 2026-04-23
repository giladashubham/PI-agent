# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Production engineering baseline:
  - TypeScript typecheck (`tsconfig.json`)
  - ESLint config (`eslint.config.mjs`)
  - Prettier config (`.prettierrc.json`, `.prettierignore`)
  - Vitest unit tests (`tests/unit/**`)
  - CI workflow (`.github/workflows/ci.yml`)
  - Dependabot config (`.github/dependabot.yml`)
- Architecture and standards documentation:
  - `docs/ARCHITECTURE.md` expanded
  - `docs/CONVENTIONS.md`
  - `docs/RELEASE.md`
  - `CONTRIBUTING.md`
  - `SECURITY.md`

### Changed

- Reorganized extension entrypoints:
  - `extensions/core/ui/index.ts` replaces `extensions/core/custom-core-ui.ts`
  - `extensions/modes/plan/index.ts` replaces `extensions/modes/question-first-plan-mode.ts`
- Reorganized `tools/web-fetch` internals by responsibility:
  - `core/` (`pipeline`, `runtime`, `browser-pool`, `cache`, `registry`)
  - `config/` (`model-selection`)
  - `ui/` (`render`, `batch-format`, `batch-status`)
  - `util/` (`path-utils`, `url-utils`)
- Reorganized unit tests by domain:
  - `tests/unit/extensions/**`
  - `tests/unit/tools/**`
  - `tests/unit/shared/**`
- Updated docs to reflect current architecture and removed stale provider-extension references.
- Plan mode persisted state continues to include model/thinking pre-plan snapshot.
- Install flow now syncs this package into `~/.pi/agent/packages/<package-name>` and registers that installed path (instead of relying on the git checkout path).
- Uninstall now removes both package registration and installed package directory (with `--keep-files` option).
- Install/uninstall scripts fail fast on malformed settings JSON.

### Fixed

- Local web-fetch extension path supports `~` expansion.
- Browser pool wait queue removes abort listeners on resolve/reject.
- Web-fetch timeout documentation matches runtime defaults.
- Lint baseline is green (`npm run lint`) after removing stale/unused imports.
