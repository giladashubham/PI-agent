# Conventions

## File placement

- `extensions/<domain>/...` for runtime extension modules
- `extensions/**/index.ts` for extension entrypoints
- `tools/<tool-name>/index.ts` for tool entrypoint extensions
- `tools/<tool-name>/{core,config,ui,util}/` for internal modules by responsibility
- `tools/<tool-name>/extensions/*.ts` for tool-specific extension handlers
- `src/shared/*.ts` for shared cross-domain utilities
- `tests/unit/{extensions,tools,shared}/**/*.test.ts` for unit tests
- `docs/**/*.md` for architecture and operational docs

## Entry points

- Every runtime extension must be registered in `package.json#pi.extensions`.
- Do not rely on implicit discovery for package-internal resources.

## Naming

- Files: kebab-case (`plan-config.ts`, `batch-status.ts`)
- Entry modules: `index.ts`
- Constants: UPPER_SNAKE_CASE
- Internal pure helpers: verb-first where possible (`formatBatchResults`, `expandHomePath`)

## Code style

- TypeScript only for runtime code
- Favor small pure modules over large monoliths
- Keep `any` usage explicit and minimal
- No dead wrappers, no stale compatibility paths

## Testing

- Unit tests in `tests/unit/**/*.test.ts`
- Shell smoke tests in `tests/smoke.sh`
- New bug fixes should include regression tests when feasible

## Documentation

When changing behavior, update docs in the same PR:

- user-facing behavior → `README.md` or tool README
- architecture/ownership → `docs/ARCHITECTURE.md`
- team standards → `docs/CONVENTIONS.md`
