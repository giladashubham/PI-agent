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

- Refactored `tools/web-fetch` internals into explicit modules:
  - `pipeline.ts`
  - `render.ts`
  - `model-selection.ts`
  - `runtime.ts`
  - `cache.ts`
  - `extension-loader.ts`
  - `url-utils.ts`
  - `batch-format.ts`
  - `batch-status.ts`
  - `path-utils.ts`
- Plan mode persisted state now includes model/thinking pre-plan snapshot.
- Install/uninstall scripts fail fast on malformed settings JSON.

### Fixed

- Local web-fetch extension path now supports `~` expansion.
- Browser pool wait queue now removes abort listeners on resolve/reject.
- Web-fetch timeout documentation now matches runtime defaults.
