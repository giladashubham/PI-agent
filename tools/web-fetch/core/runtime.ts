import { spawn } from "node:child_process";
import type { BrowserPool } from "./browser-pool.js";

interface PythonRunner {
  command: string;
  trafilaturaArgs: () => string[];
}

const PYTHON_RUNNERS: PythonRunner[] = [
  { command: "uvx", trafilaturaArgs: () => ["trafilatura", "--markdown", "--formatting"] },
  {
    command: "uv",
    trafilaturaArgs: () => ["run", "--with", "trafilatura", "trafilatura", "--markdown", "--formatting"],
  },
  { command: "pipx", trafilaturaArgs: () => ["run", "trafilatura", "--markdown", "--formatting"] },
  {
    command: "pip-run",
    trafilaturaArgs: () => ["trafilatura", "--", "-m", "trafilatura", "--markdown", "--formatting"],
  },
];

let detectedRunner: PythonRunner | null = null;
let runnerDetectionDone = false;

function killProcess(proc: ReturnType<typeof spawn>): void {
  proc.kill("SIGTERM");
  setTimeout(() => {
    if (!proc.killed) proc.kill("SIGKILL");
  }, 5000);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000} seconds`));
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

export interface ExecResult {
  code: number;
}

export type ExecFn = (command: string, args: string[], options?: { timeout?: number }) => Promise<ExecResult>;

export async function detectPythonRunner(execFn: ExecFn): Promise<boolean> {
  if (runnerDetectionDone) return detectedRunner !== null;

  for (const runner of PYTHON_RUNNERS) {
    try {
      const result = await execFn(runner.command, ["--version"], { timeout: 5000 });
      if (result.code === 0) {
        detectedRunner = runner;
        runnerDetectionDone = true;
        return true;
      }
    } catch {
      // try next
    }
  }

  runnerDetectionDone = true;
  return false;
}

export interface RedirectResult {
  redirectedTo: string;
}

export interface FetchResult {
  html: string;
  finalUrl: string;
}

export async function fetchPage(
  browserPool: BrowserPool,
  url: string,
  pageTimeoutMs: number,
  signal?: AbortSignal,
): Promise<{ ok: true; result: FetchResult } | { ok: true; redirect: RedirectResult } | { ok: false; error: string }> {
  let page: Awaited<ReturnType<BrowserPool["acquire"]>> | null = null;

  try {
    if (signal?.aborted) return { ok: false, error: "Aborted" };

    page = await browserPool.acquire(signal);
    const requestUrl = new URL(url);
    let crossHostRedirect: string | null = null;

    page.on("response", (response) => {
      if (!response.request().isNavigationRequest()) return;

      const status = response.status();
      if (status >= 300 && status < 400) {
        const location = response.headers()["location"];
        if (location) {
          try {
            const redirectUrl = new URL(location, url);
            if (redirectUrl.hostname !== requestUrl.hostname) {
              crossHostRedirect = redirectUrl.toString();
            }
          } catch {
            // ignore malformed redirect URLs
          }
        }
      }
    });

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: pageTimeoutMs });
    } catch (err: any) {
      if (signal?.aborted) return { ok: false, error: "Aborted" };
      if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
        return { ok: false, error: `Page load timed out after ${pageTimeoutMs / 1000} seconds for URL: ${url}` };
      }
      return { ok: false, error: `Failed to load page: ${err.message}` };
    }

    if (crossHostRedirect) {
      return { ok: true, redirect: { redirectedTo: crossHostRedirect } };
    }

    return {
      ok: true,
      result: {
        html: await page.content(),
        finalUrl: page.url(),
      },
    };
  } catch (err: any) {
    if (signal?.aborted) return { ok: false, error: "Aborted" };
    return { ok: false, error: `Browser error: ${err.message}` };
  } finally {
    if (page) await browserPool.release(page);
  }
}

export async function extractContent(
  html: string,
  signal?: AbortSignal,
): Promise<{ ok: true; markdown: string } | { ok: false; error: string }> {
  if (signal?.aborted) return { ok: false, error: "Aborted" };
  if (!detectedRunner) {
    return { ok: false, error: "No Python tool runner found. Install one of: uv (recommended), pipx, or pip-run." };
  }

  const command = detectedRunner.command;
  const args = detectedRunner.trafilaturaArgs();

  return new Promise((resolve) => {
    const proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    const onAbort = () => killProcess(proc);
    signal?.addEventListener("abort", onAbort, { once: true });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) return resolve({ ok: false, error: "Aborted" });
      if (code !== 0) {
        return resolve({
          ok: false,
          error: `Trafilatura extraction failed (exit code ${code}): ${stderr.trim() || "(no error output)"}`,
        });
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        return resolve({
          ok: false,
          error:
            "Trafilatura extracted no content from the page. The page may be empty or use a format that trafilatura cannot parse.",
        });
      }
      return resolve({ ok: true, markdown: trimmed });
    });

    proc.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      resolve({ ok: false, error: `Failed to run ${command} trafilatura: ${err.message}` });
    });

    proc.stdin.write(html);
    proc.stdin.end();
  });
}

export interface SubAgentResult {
  ok: true;
  response: string;
}

export interface SubAgentError {
  ok: false;
  error: string;
}

export async function runSubAgent(
  content: string,
  prompt: string,
  model: string,
  thinkingLevel: string,
  signal?: AbortSignal,
): Promise<SubAgentResult | SubAgentError> {
  if (signal?.aborted) return { ok: false, error: "Aborted" };

  const fullPrompt = `Web page content:\n---\n${content}\n---\n\n${prompt}`;

  return new Promise((resolve) => {
    const proc = spawn(
      "pi",
      ["--mode", "json", "-p", "--no-session", "--no-tools", "--model", model, "--thinking", thinkingLevel, fullPrompt],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let buffer = "";
    let lastAssistantText = "";
    let stderr = "";

    const onAbort = () => killProcess(proc);
    signal?.addEventListener("abort", onAbort, { once: true });

    const processLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.type === "message_end" && event.message?.role === "assistant") {
          for (const part of event.message.content) {
            if (part.type === "text") {
              lastAssistantText = part.text;
            }
          }
        }
      } catch {
        // ignore non-JSON lines
      }
    };

    proc.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (buffer.trim()) processLine(buffer);

      if (signal?.aborted) {
        resolve({ ok: false, error: "Aborted" });
      } else if (lastAssistantText) {
        resolve({ ok: true, response: lastAssistantText });
      } else if (code !== 0) {
        resolve({ ok: false, error: `Sub-agent failed (exit code ${code}): ${stderr.trim() || "(no output)"}` });
      } else {
        resolve({ ok: false, error: "Sub-agent returned no response" });
      }
    });

    proc.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      resolve({ ok: false, error: `Failed to spawn pi sub-agent: ${err.message}` });
    });
  });
}
