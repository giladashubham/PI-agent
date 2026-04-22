# Roadmap

This repository recently completed a structure and production-readiness cleanup.

## Completed

- Extension entrypoint cleanup:
  - `extensions/core/ui/index.ts`
  - `extensions/modes/plan/index.ts`
- Web-fetch module split by responsibility (`core`, `config`, `ui`, `util`)
- Unit tests reorganized by domain (`extensions`, `tools`, `shared`)
- Architecture/extension/config docs updated
- OSS collaboration baseline added:
  - issue templates
  - PR template
  - code of conduct
- CI baseline green (`npm run test:ci`)

## Next candidates

- Add integration tests for web-fetch pipeline with mocked runtime boundaries
- Add release automation for changelog/version/tag flow
- Expand docs with ADRs for major architecture decisions
