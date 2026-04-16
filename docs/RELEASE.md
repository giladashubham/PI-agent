# Release Process

This repo uses semantic versioning.

## Versioning rules

- **MAJOR**: breaking behavior or contract change
- **MINOR**: backward-compatible feature additions
- **PATCH**: fixes and non-behavioral maintenance

## Release checklist

1. `npm run test:ci`
2. Update `CHANGELOG.md` under `[Unreleased]`
3. Bump `package.json` version
4. Move release notes from `[Unreleased]` to a versioned section
5. Tag release: `vX.Y.Z`

## Notes

- No compatibility wrappers by default.
- Remove stale code paths before tagging release.
