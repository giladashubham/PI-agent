# Security Policy

This repository contains Pi extensions and skills that execute with local user permissions.

## Reporting

If you find a vulnerability, open a private security advisory (preferred) or contact the maintainer directly before public disclosure.

## Scope

Security-sensitive areas include:

- shell execution paths (`bash`, user shell interactions)
- file mutation paths (`edit`, `write`, custom tools)
- external fetch/process execution in `tools/web-fetch`
- install/uninstall scripts that modify Pi settings

## Hardening expectations

- validate and sanitize untrusted input
- fail closed on malformed configuration
- avoid hidden fallback behavior that can mask errors
- keep dependencies current and review lockfile diffs
