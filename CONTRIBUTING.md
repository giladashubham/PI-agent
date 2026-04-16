# Contributing

## Setup

```bash
npm install
```

## Validate locally

```bash
npm run typecheck
npm run lint
npm test
```

## Development rules

1. Keep changes scoped to the requested behavior.
2. Prefer simple, explicit code over abstractions.
3. Add/adjust tests for behavior changes.
4. Update docs in the same PR.
5. Do not add backward-compat wrappers unless explicitly required.

## PR checklist

- [ ] `npm run test:ci` passes
- [ ] behavior documented (README/docs)
- [ ] no unrelated refactors
- [ ] no stale files/paths left behind
