# Web Fetch Tool

`web_fetch` retrieves and extracts web page content as markdown, with optional prompt-based distillation.

## What it does

- Fetches pages via Puppeteer
- Extracts readable markdown via `trafilatura`
- Optionally summarizes/extracts via a Pi sub-agent model
- Supports batch mode (`pages[]`) with live status updates
- Supports site-specific hooks via built-in/local/event-bus extensions

## Folder structure

```text
tools/web-fetch/
├── index.ts              # tool registration + top-level orchestration
├── core/
│   ├── pipeline.ts       # fetch/extract/process flow
│   ├── runtime.ts        # browser + extraction runner + sub-agent
│   ├── browser-pool.ts   # shared browser/tab pool
│   ├── cache.ts          # in-memory TTL cache
│   └── registry.ts       # extension matching and priority
├── config/
│   └── model-selection.ts
├── ui/
│   ├── render.ts
│   ├── batch-format.ts
│   └── batch-status.ts
├── util/
│   ├── url-utils.ts
│   └── path-utils.ts
├── extensions/
│   ├── github-redirect.ts
│   └── google-docs-redirect.ts
├── extension-loader.ts
└── types.ts
```

## Config

Config sources (first match wins):

1. `~/.pi/agent/pi-agent-custom.json.webFetch`
2. `~/.pi/agent/settings.json.webFetch`
3. `~/.pi/agent/web-fetch.json` (legacy fallback)

Supported keys:

- `model` (string)
- `thinkingLevel` (`off|low|medium|high|xhigh`, default `low`)
- `extensionsDir` (string path)
- `pageTimeoutMs` (number, default `10000`)
- `extractTimeoutMs` (number, default `10000`)
- `subagentTimeoutMs` (number, default `45000`)

## Local site extensions

Place `.ts`/`.js` files in `extensionsDir` (default: `~/.pi/extensions/web-fetch`).
Each file should default-export a factory returning a `WebFetchExtension`.

Example:

```ts
import type { WebFetchExtension } from "../types.js";

export default function (): WebFetchExtension {
  return {
    name: "my-site",
    matches: ["example.com/**"],
    async beforeFetch(ctx) {
      // optional pre-fetch logic
    },
  };
}
```

## Notes

- Plain HTTP is normalized to HTTPS.
- Cross-host redirects are surfaced (not auto-followed).
- Cache is short-lived in-memory (session runtime only).
