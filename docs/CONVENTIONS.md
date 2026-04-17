# Conventions

## File placement

- `extensions/<domain>/*.ts` for extension entrypoints
- `tools/<tool-name>/index.ts` for tool entrypoint extensions
- `tools/<tool-name>/*.ts` for internal modules (pure helpers preferred)
- `skills/<skill-name>/SKILL.md` for optional Agent Skills
- `docs/*.md` for architecture and operational documentation

## Entry points

- Every runtime extension must be registered in `package.json#pi.extensions`.
- Do not rely on implicit discovery for package-internal resources.

## Naming

- Files: kebab-case (`question-first-plan-mode.ts`)
- Skills (when present): directory name must match `frontmatter.name`
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
- New bug fixes require a regression test whenever feasible

## Documentation

When changing behavior, update docs in the same PR:

- user-facing behavior -> `README.md` or tool README
- architecture/ownership -> `docs/ARCHITECTURE.md`
- team standards -> `docs/CONVENTIONS.md`
