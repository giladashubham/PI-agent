import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@mariozechner/pi-coding-agent";
import { formatBatchResults } from "./batch-format.js";
import type { WebFetchCache } from "./cache.js";
import type { ExtensionRegistry } from "./registry.js";
import type { BrowserPool } from "./browser-pool.js";
import type {
  AfterExtractHookContext,
  AfterFetchHookContext,
  HookContext,
  HookResult,
  SummarizeHookContext,
  WebFetchExtension,
} from "./types.js";
import { createHookContext } from "./types.js";
import { validateAndNormalizeUrl } from "./url-utils.js";
import {
  extractContent,
  fetchPage,
  runSubAgent,
  withTimeout,
  type RedirectResult,
  type SubAgentError,
} from "./runtime.js";
import type { BatchDetails, BatchPageState, BatchPageStatus } from "./batch-status.js";

const CONTENT_SIZE_THRESHOLD = 50_000;
const CONTENT_GUARDRAILS = `Respond concisely using only the page content above.
- Keep direct quotes under 125 characters and always use quotation marks for exact wording.
- Outside of quotes, rephrase in your own words — never reproduce source text verbatim.
- Open-source code and documentation snippets are fine to include as-is.`;

const SUMMARIZE_PROMPT = `Summarize this page:
1. A 2-3 sentence overview of the page's purpose.
2. For each major section or heading, its name and a 1-2 sentence description.
3. End with: "To extract specific information, call web_fetch again with the same URL and a prompt. The page is cached so re-fetching is instant."

${CONTENT_GUARDRAILS}`;

interface PipelineDeps {
  browserPool: BrowserPool;
  registry: ExtensionRegistry;
  cache: WebFetchCache;
  pageTimeoutMs: number;
  extractTimeoutMs: number;
  subagentTimeoutMs: number;
}

type ToolUpdateFn = (partial: { content: Array<{ type: string; text?: string }>; details?: unknown }) => void;

export function createWebFetchPipeline(deps: PipelineDeps) {
  async function processSingleUrl(
    rawUrl: string,
    prompt: string | undefined,
    model: string | undefined,
    thinkingLevel: string,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateFn,
  ): Promise<any> {
    const urlResult = validateAndNormalizeUrl(rawUrl);
    if (urlResult.error) {
      return { content: [{ type: "text", text: urlResult.error }], isError: true };
    }
    const url = urlResult.url;

    const matchedExtension = deps.registry.match(url);
    const hookCtx = createHookContext(url, { prompt, signal });

    const cached = deps.cache.get(url);
    if (cached) {
      onUpdate?.({ content: [{ type: "text", text: "Cache hit — processing..." }], details: {} });
      return await runProcess(cached, prompt, model, thinkingLevel, matchedExtension, hookCtx, signal, onUpdate);
    }

    if (matchedExtension?.beforeFetch) {
      const hookResult = await matchedExtension.beforeFetch(hookCtx);
      if (hookResult) return hookResult;
    }

    const fetchOuter = await runFetch(url, signal, onUpdate);
    if (fetchOuter.done) return fetchOuter.result;
    let html = (fetchOuter as { done: false; html: string }).html;

    if (matchedExtension?.afterFetch) {
      const afterFetchCtx: AfterFetchHookContext = { ...hookCtx, html };
      const hookResult = await matchedExtension.afterFetch(afterFetchCtx);
      if (hookResult) {
        if ("content" in hookResult && Array.isArray(hookResult.content)) {
          return hookResult as HookResult;
        }
        if ("html" in hookResult && typeof (hookResult as any).html === "string") {
          html = (hookResult as { html: string }).html;
        }
      }
    }

    const extractOuter = await runExtract(html, signal, onUpdate);
    if (extractOuter.done) return extractOuter.result;
    let markdown = (extractOuter as { done: false; markdown: string }).markdown;

    if (matchedExtension?.afterExtract) {
      const afterExtractCtx: AfterExtractHookContext = { ...hookCtx, markdown };
      const hookResult = await matchedExtension.afterExtract(afterExtractCtx);
      if (hookResult) {
        if (typeof hookResult === "string") {
          markdown = hookResult;
        } else if ("content" in hookResult && Array.isArray(hookResult.content)) {
          return hookResult as HookResult;
        }
      }
    }

    deps.cache.set(url, markdown);
    return await runProcess(markdown, prompt, model, thinkingLevel, matchedExtension, hookCtx, signal, onUpdate);
  }

  async function executeBatch(
    pages: Array<{ url: string; prompt?: string }>,
    model: string | undefined,
    thinkingLevel: string,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateFn,
  ): Promise<any> {
    const pageStates: BatchPageState[] = pages.map((p) => ({ url: p.url, status: "pending" as BatchPageStatus }));

    function emitBatchUpdate() {
      onUpdate?.({ content: [{ type: "text", text: "" }], details: { pages: pageStates } as BatchDetails });
    }

    emitBatchUpdate();

    const promises = pages.map(async (page, i) => {
      const pageOnUpdate: ToolUpdateFn = (partial) => {
        const text = partial.content?.[0];
        if (text?.type === "text") {
          const msg = text.text || "";
          if (msg.startsWith("Fetching")) {
            pageStates[i].status = "fetching";
          } else if (msg.startsWith("Extracting")) {
            pageStates[i].status = "extracting";
          } else if (msg.startsWith("Processing") || msg.includes("summary") || msg.includes("Cache hit")) {
            pageStates[i].status = "summarizing";
          }
        }
        emitBatchUpdate();
      };

      const result = await processSingleUrl(page.url, page.prompt, model, thinkingLevel, signal, pageOnUpdate);

      if (result.isError) {
        pageStates[i].status = "error";
        const errText = result.content?.[0];
        if (errText?.type === "text") {
          pageStates[i].error = errText.text;
        }
      } else {
        pageStates[i].status = "done";
      }
      emitBatchUpdate();

      return result;
    });

    const results = await Promise.allSettled(promises);
    return formatBatchResults(pages, results);
  }

  async function runFetch(
    url: string,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateFn,
  ): Promise<{ done: true; result: any } | { done: false; html: string }> {
    onUpdate?.({ content: [{ type: "text", text: `Fetching ${url}...` }], details: {} });

    const fetchResult = await fetchPage(deps.browserPool, url, deps.pageTimeoutMs, signal);
    if (!fetchResult.ok) {
      return {
        done: true,
        result: {
          content: [{ type: "text", text: (fetchResult as { ok: false; error: string }).error }],
          isError: true,
        },
      };
    }

    if ("redirect" in fetchResult) {
      const redirectUrl = (fetchResult as { ok: true; redirect: RedirectResult }).redirect.redirectedTo;
      return {
        done: true,
        result: {
          content: [
            {
              type: "text",
              text: `The URL redirected to a different host: ${redirectUrl}\n\nTo fetch the content, make a new web_fetch call with this URL: ${redirectUrl}`,
            },
          ],
        },
      };
    }

    return { done: false, html: fetchResult.result.html };
  }

  async function runExtract(
    html: string,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateFn,
  ): Promise<{ done: true; result: any } | { done: false; markdown: string }> {
    onUpdate?.({ content: [{ type: "text", text: "Extracting content..." }], details: {} });

    const extractResult = await withTimeout(
      extractContent(html, signal),
      deps.extractTimeoutMs,
      "Content extraction",
      signal,
    ).catch((err): { ok: false; error: string } => ({ ok: false, error: err.message }));

    if (!extractResult.ok) {
      return {
        done: true,
        result: {
          content: [{ type: "text", text: (extractResult as { ok: false; error: string }).error }],
          isError: true,
        },
      };
    }

    return { done: false, markdown: extractResult.markdown };
  }

  async function runProcess(
    markdown: string,
    prompt: string | undefined,
    model: string | undefined,
    thinkingLevel: string,
    matchedExtension: WebFetchExtension | null,
    hookCtx: HookContext,
    signal?: AbortSignal,
    onUpdate?: ToolUpdateFn,
  ): Promise<any> {
    if (matchedExtension?.summarize) {
      const summarizeCtx: SummarizeHookContext = { ...hookCtx, markdown };
      const hookResult = await matchedExtension.summarize(summarizeCtx);
      if (hookResult) return hookResult;
    }

    if (prompt && model) {
      onUpdate?.({ content: [{ type: "text", text: "Processing with LLM..." }], details: {} });

      const agentResult = await withTimeout(
        runSubAgent(markdown, `${prompt}\n\n${CONTENT_GUARDRAILS}`, model, thinkingLevel, signal),
        deps.subagentTimeoutMs,
        "LLM processing",
        signal,
      ).catch((err): SubAgentError => ({ ok: false, error: err.message }));
      if (agentResult.ok) {
        return { content: [{ type: "text", text: agentResult.response }] };
      }

      const truncation = truncateHead(markdown, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
      let fallbackText = truncation.content;
      if (truncation.truncated) {
        fallbackText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
      }
      fallbackText += `\n\n⚠️ LLM processing failed: ${(agentResult as SubAgentError).error}. Returning raw extracted content instead.`;
      return { content: [{ type: "text", text: fallbackText }] };
    }

    if (markdown.length <= CONTENT_SIZE_THRESHOLD) {
      return { content: [{ type: "text", text: markdown }] };
    }

    if (!model) {
      const truncation = truncateHead(markdown, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
      let text = truncation.content;
      if (truncation.truncated) {
        text += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
      }
      return { content: [{ type: "text", text }] };
    }

    onUpdate?.({ content: [{ type: "text", text: "Page content is large — generating summary..." }], details: {} });

    const summaryResult = await withTimeout(
      runSubAgent(markdown, SUMMARIZE_PROMPT, model, thinkingLevel, signal),
      deps.subagentTimeoutMs,
      "LLM summarization",
      signal,
    ).catch((err): SubAgentError => ({ ok: false, error: err.message }));
    if (summaryResult.ok) {
      return { content: [{ type: "text", text: summaryResult.response }] };
    }

    const truncation = truncateHead(markdown, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
    let fallbackText = truncation.content;
    if (truncation.truncated) {
      fallbackText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
    }
    fallbackText += `\n\n⚠️ Could not generate summary: ${(summaryResult as SubAgentError).error}. Returning truncated raw content. Consider calling web_fetch again with a prompt to extract specific information.`;
    return { content: [{ type: "text", text: fallbackText }] };
  }

  return {
    executeBatch,
  };
}
