# Extending PI-Agent

This guide covers how to add new extensions, tools, providers, and themes to the PI-Agent extension pack.

## Quick Start

### Adding an Extension

1. Copy the template:
   ```bash
   cp templates/extension/my-extension.ts extensions/<category>/my-extension.ts
   ```

2. Edit the file and implement your logic

3. Register in `package.json`:
   ```json
   {
     "pi": {
       "extensions": [
         "./extensions/<category>/my-extension.ts"
       ]
     }
   }
   ```

4. Restart Pi or run `/reload`

### Adding a Tool

1. Create a new directory under `tools/`:
   ```bash
   cp -r templates/tool/my-tool tools/my-tool
   ```

2. Implement your tool in `tools/my-tool/index.ts`

3. Register the entrypoint in `package.json`

### Adding a Theme

1. Copy the template:
   ```bash
   cp templates/theme/my-theme.json themes/my-theme.json
   ```

2. Customize the colors

3. The theme directory is auto-discovered from `package.json#pi.themes`

## Extension Categories

| Category | Directory | Purpose |
|----------|-----------|---------|
| Core | `extensions/core/` | Session UX: status, footer, banner, env loading |
| Modes | `extensions/modes/` | Conversation flow control (plan mode, etc.) |
| Policies | `extensions/policies/` | System prompt behavior injection |
| Providers | `extensions/providers/` | Model/provider filtering and configuration |
| Tools | `tools/<name>/` | Custom tool implementations |

## Shared Infrastructure

Common utilities are available in `src/shared/`:

- `config.ts` — JSON config reading/writing with fallback chains
- `paths.ts` — Standard path constants (PI_AGENT_DIR, config files, etc.)
- `types.ts` — Shared type definitions (Cost, DynamicProviderModel, etc.)
- `ansi.ts` — ANSI color helpers
- `formatting.ts` — Number/duration/money formatting

Import via:
```typescript
import { readJsonObject, CUSTOM_CONFIG_PATH } from "../../src/shared/index.js";
```

## Testing Your Extension

1. Add unit tests in `tests/unit/<name>.test.ts`
2. Run: `npm run test:unit`
3. Run full validation: `npm run test:ci`

## Web-Fetch Extensions

The web-fetch tool has its own extension system for site-specific handlers:

1. Create a handler in `tools/web-fetch/extensions/`:
   ```typescript
   import type { WebFetchExtension } from "../types.js";

   export default function (): WebFetchExtension {
     return {
       name: "my-site-handler",
       matches: ["example.com/**"],
       async beforeFetch(ctx) {
         // Custom fetch logic
       },
     };
   }
   ```

2. Or register via the event bus from any extension:
   ```typescript
   pi.events.emit("web-fetch:register", {
     name: "my-handler",
     matches: ["example.com/**"],
     async beforeFetch(ctx) { /* ... */ },
   });
   ```