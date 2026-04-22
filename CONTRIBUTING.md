# Contributing

Thanks for contributing.

## Setup

```bash
npm install
```

## Validate locally

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:smoke
npm run test:ci
```

## Development rules

1. Keep changes scoped to requested behavior.
2. Prefer simple, explicit code over speculative abstractions.
3. Add/adjust tests for behavior changes.
4. Update docs in the same PR.
5. Do not add backward-compat wrappers unless explicitly required.

## Repository structure (quick map)

- `extensions/core/**` — UI + env-loader
- `extensions/modes/plan/**` — plan mode runtime + helpers
- `extensions/policies/**` — system prompt policy
- `tools/web-fetch/**` — web-fetch tool implementation
- `src/shared/**` — shared helpers
- `tests/unit/**` — unit tests by domain (`extensions`, `tools`, `shared`)

## Pull request checklist

- [ ] `npm run test:ci` passes locally
- [ ] behavior documented (`README.md`, `docs/**`, or tool README)
- [ ] no unrelated refactors
- [ ] no stale files/paths left behind
- [ ] changelog entry added/updated under `[Unreleased]` (if user-visible)
