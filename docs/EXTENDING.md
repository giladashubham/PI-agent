# Extending PI-Agent

This guide covers how to add new extensions, tools, and themes to this PI-Agent bundle.

## Quick Start

### Adding an Extension

1. Copy the template:

   ```bash
   cp templates/extension/my-extension.ts extensions/<category>/my-extension.ts
   ```

2. Edit the file and implement your logic.

3. Register in `package.json` under `pi.extensions`:

   ```json
   {
     "pi": {
       "extensions": [
         "./extensions/<category>/my-extension.ts"
       ]
     }
   }
   ```

4. Restart Pi or run `/reload`.

### Adding a Tool

1. Create a new directory under `tools/`:

   ```bash
   cp -r templates/tool/my-tool tools/my-tool
   ```

2. Implement your tool in `tools/my-tool/index.ts`.

3. Register the entrypoint in `package.json#pi.extensions`.

### Adding a Theme

1. Copy the template:

   ```bash
   cp templates/theme/my-theme.json themes/my-theme.json
   ```

2. Customize colors.

3. Themes are discovered from `package.json#pi.themes`.

## Extension Categories

| Category | Directory | Purpose |
|---|---|---|
| Core | `extensions/core/` | Session UX: env loading + UI surface |
| Modes | `extensions/modes/` | Conversation flow control (plan mode, etc.) |
| Policies | `extensions/policies/` | System prompt behavior injection |
| Tools | `tools/<name>/` | Custom tool implementations |

## Shared Infrastructure

Common utilities are available in `src/shared/`:

- `config.ts` — JSON config reading/writing with fallback chains
- `paths.ts` — standard path constants (`PI_AGENT_DIR`, config files, etc.)
- `types.ts` — shared type definitions (plan mode config, thinking-level helpers)
- `ansi.ts` — ANSI color helpers
- `formatting.ts` — number/duration/token formatting

Import via:

```typescript
import { readJsonObject, CUSTOM_CONFIG_PATH } from "../../src/shared/index.js";
```

## Testing Your Extension

1. Add unit tests in `tests/unit/**` near the relevant domain:
   - `tests/unit/extensions/...`
   - `tests/unit/tools/...`
   - `tests/unit/shared/...`
2. Run unit tests: `npm run test:unit`
3. Run full validation: `npm run test:ci`

## Web-Fetch Extensions

`web_fetch` has a site-extension system.

### File-based extension

Create a handler in `tools/web-fetch/extensions/`:

```typescript
import type { WebFetchExtension } from "../types.js";

export default function (): WebFetchExtension {
  return {
    name: "my-site-handler",
    matches: ["example.com/**"],
    async beforeFetch(ctx) {
      // custom logic
    },
  };
}
```

### Event-bus registration

From any runtime extension:

```typescript
pi.events.emit("web-fetch:register", {
  name: "my-handler",
  matches: ["example.com/**"],
  async beforeFetch(ctx) {
    // custom logic
  },
});
```
