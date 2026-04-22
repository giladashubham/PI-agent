import { readJsonObject } from "../../src/shared/config.js";
import {
  CUSTOM_CONFIG_PATH,
  SETTINGS_PATH,
  LEGACY_WEB_FETCH_CONFIG_PATH,
  DEFAULT_WEB_FETCH_EXTENSIONS_DIR,
} from "../../src/shared/paths.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { BrowserPool } from "./core/browser-pool.js";
import { expandHomePath } from "./util/path-utils.js";
import { ExtensionRegistry } from "./core/registry.js";
import { loadBuiltInExtensions, loadLocalExtensions, setupEventBusRegistration } from "./extension-loader.js";
import { createWebFetchCache } from "./core/cache.js";
import { detectPythonRunner } from "./core/runtime.js";
import { createWebFetchPipeline } from "./core/pipeline.js";
import { resolveSubAgentModel, type SubAgentModelConfig } from "./config/model-selection.js";
import { renderWebFetchCall, renderWebFetchResult } from "./ui/render.js";
export type {
  WebFetchExtension,
  HookContext,
  HookResult,
  AfterFetchHookContext,
  AfterExtractHookContext,
  SummarizeHookContext,
  ToolContent,
} from "./types.js";

interface WebFetchConfig extends SubAgentModelConfig {
  thinkingLevel?: string;
  extensionsDir?: string;
  pageTimeoutMs?: number;
  extractTimeoutMs?: number;
  subagentTimeoutMs?: number;
}

const VALID_THINKING_LEVELS = new Set(["off", "low", "medium", "high", "xhigh"]);
function loadConfig(): WebFetchConfig {
  const custom = readJsonObject(CUSTOM_CONFIG_PATH);
  const customConfig = custom?.webFetch;
  if (customConfig && typeof customConfig === "object" && !Array.isArray(customConfig)) {
    return customConfig as WebFetchConfig;
  }

  const settings = readJsonObject(SETTINGS_PATH);
  const settingsConfig = settings?.webFetch;
  if (settingsConfig && typeof settingsConfig === "object" && !Array.isArray(settingsConfig)) {
    return settingsConfig as WebFetchConfig;
  }

  const legacy = readJsonObject(LEGACY_WEB_FETCH_CONFIG_PATH);
  return (legacy as WebFetchConfig | undefined) ?? {};
}
function resolveThinkingLevel(value: string | undefined): string {
  if (!value) return "low";
  const normalized = value.trim().toLowerCase();
  return VALID_THINKING_LEVELS.has(normalized) ? normalized : "low";
}

function resolveTimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < 1000) return fallback;
  return Math.floor(value);
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_TIMEOUT_MS = 10_000;
const DEFAULT_EXTRACT_TIMEOUT_MS = 10_000;
const DEFAULT_SUBAGENT_TIMEOUT_MS = 45_000;
export const MAX_BATCH_SIZE = 10;

const WEB_FETCH_DESCRIPTION = [
  "Retrieves and extracts the main content of a web page as markdown.",
  "",
  "Include a 'prompt' parameter to have an LLM distill the page down to just the information you need — this saves significant context compared to ingesting raw page content.",
  "Without a prompt, the full extracted markdown is returned (or a structured overview if the page is large).",
  "",
  "Batch mode: use 'pages' instead of 'url' to fetch multiple URLs in a single call. Each entry can have its own prompt.",
  "This is much faster than making separate web_fetch calls when you need content from several pages.",
  "The 'url' and 'pages' parameters are mutually exclusive. Maximum 10 pages per batch.",
  "",
  "When to use something else:",
  "- The gh CLI (via bash) for anything on GitHub — issues, PRs, repo contents, API calls.",
  "",
  "Behavior notes:",
  "- URLs must include the scheme (e.g. https://). Plain HTTP is silently upgraded to HTTPS.",
  "- Fetched content is held in a short-lived cache, so asking multiple questions about the same page is cheap.",
  "- Cross-host redirects are surfaced rather than followed — make a second request to the target URL.",
  "- No files or external state are modified by this tool.",
].join("\n");

export default function webFetchExtension(pi: ExtensionAPI) {
  const config = loadConfig();
  const pageTimeoutMs = resolveTimeout(config.pageTimeoutMs, DEFAULT_PAGE_TIMEOUT_MS);
  const extractTimeoutMs = resolveTimeout(config.extractTimeoutMs, DEFAULT_EXTRACT_TIMEOUT_MS);
  const subagentTimeoutMs = resolveTimeout(config.subagentTimeoutMs, DEFAULT_SUBAGENT_TIMEOUT_MS);

  const registry = new ExtensionRegistry();
  const browserPool = new BrowserPool({ maxTabs: 6, idleTimeoutMs: 60_000 });
  const cache = createWebFetchCache(CACHE_TTL_MS);
  const pipeline = createWebFetchPipeline({
    browserPool,
    registry,
    cache,
    pageTimeoutMs,
    extractTimeoutMs,
    subagentTimeoutMs,
  });

  let cleanupInterval: ReturnType<typeof setInterval> | null = null;

  pi.on("session_start", async (_event, ctx) => {
    const hasRunner = await detectPythonRunner(pi.exec.bind(pi));
    if (!hasRunner) {
      ctx.ui.notify(
        "web_fetch: no Python tool runner found. Install one of: uv (recommended), pipx, or pip-run",
        "error",
      );
    }

    setupEventBusRegistration(pi, registry);
    await loadBuiltInExtensions(registry, ctx.ui.notify.bind(ctx.ui));

    const localDir = config.extensionsDir
      ? expandHomePath(config.extensionsDir)
      : DEFAULT_WEB_FETCH_EXTENSIONS_DIR;
    await loadLocalExtensions(registry, localDir, ctx.ui.notify.bind(ctx.ui));

    pi.events.emit("web-fetch:ready", undefined);
    cleanupInterval = setInterval(() => cache.cleanup(), CACHE_CLEANUP_INTERVAL_MS);
  });

  pi.on("session_shutdown", async () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
    cache.clear();
    await browserPool.shutdown();
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: WEB_FETCH_DESCRIPTION,
    parameters: Type.Object({
      url: Type.Optional(
        Type.String({
          description: "Fully-formed URL to fetch (e.g., https://example.com/page). Mutually exclusive with 'pages'.",
        }),
      ),
      prompt: Type.Optional(
        Type.String({
          description:
            "What information to extract from the page. Strongly recommended — the page content will be processed by a fast LLM and only relevant information returned. Omit only if you need the full raw content. Only used with 'url', not 'pages'.",
        }),
      ),
      pages: Type.Optional(
        Type.Array(
          Type.Object({
            url: Type.String({ description: "Fully-formed URL to fetch" }),
            prompt: Type.Optional(Type.String({ description: "What information to extract from this page" })),
          }),
          {
            maxItems: MAX_BATCH_SIZE,
            description: `Array of pages to fetch concurrently (max ${MAX_BATCH_SIZE}). Mutually exclusive with 'url'. Each entry can have its own prompt.`,
          },
        ),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      const modelResolution = resolveSubAgentModel(config);
      const model = modelResolution.model;
      const thinkingLevel = resolveThinkingLevel(config.thinkingLevel);
      const hasUrl = params.url !== undefined && params.url !== null;
      const hasPages = params.pages !== undefined && params.pages !== null;

      if (hasUrl && hasPages) {
        return {
          content: [
            {
              type: "text",
              text: "The 'url' and 'pages' parameters are mutually exclusive. Use 'url' for a single page or 'pages' for batch fetching, not both.",
            },
          ],
          isError: true,
        };
      }

      if (!hasUrl && !hasPages) {
        return { content: [{ type: "text", text: "Either 'url' or 'pages' must be provided." }], isError: true };
      }

      if (hasPages) {
        const pages = params.pages!;
        if (pages.length === 0) {
          return {
            content: [{ type: "text", text: "The 'pages' array must contain at least one entry." }],
            isError: true,
          };
        }
        if (pages.length > MAX_BATCH_SIZE) {
          return {
            content: [{ type: "text", text: `The 'pages' array exceeds the maximum batch size of ${MAX_BATCH_SIZE}.` }],
            isError: true,
          };
        }
        return await pipeline.executeBatch(pages, model, thinkingLevel, signal, onUpdate as any);
      }

      return await pipeline.executeBatch(
        [{ url: params.url!, prompt: params.prompt }],
        model,
        thinkingLevel,
        signal,
        onUpdate as any,
      );
    },
    renderCall(args, theme) {
      return renderWebFetchCall(args, theme);
    },
    renderResult(result, options, theme) {
      return renderWebFetchResult(result, options, theme);
    },
  });
}
