import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AdvisorToolProfile } from "./advisor-tool-policy.js";
import { getAdvisorBuiltinTools } from "./advisor-tool-policy.js";

const WEB_FETCH_EXTENSION_PATH = fileURLToPath(new URL("../../../tools/web-fetch/index.ts", import.meta.url));

function killProcess(proc: ReturnType<typeof spawn>): void {
  if (proc.killed) return;
  proc.kill("SIGTERM");
  setTimeout(() => {
    if (!proc.killed) proc.kill("SIGKILL");
  }, 5000);
}

function extractAssistantText(line: string): string | undefined {
  if (!line.trim()) return undefined;

  try {
    const event = JSON.parse(line);
    if (event?.type !== "message_end" || event.message?.role !== "assistant") {
      return undefined;
    }

    const content: unknown[] = Array.isArray(event.message?.content) ? event.message.content : [];
    const textParts = content
      .filter((part: unknown): part is { type: "text"; text: string } => {
        if (!part || typeof part !== "object") return false;
        const maybePart = part as { type?: unknown; text?: unknown };
        return maybePart.type === "text" && typeof maybePart.text === "string";
      })
      .map((part) => part.text)
      .filter(Boolean);

    if (textParts.length === 0) return undefined;
    return textParts.join("\n\n");
  } catch {
    return undefined;
  }
}

export interface AdvisorSubagentArgsInput {
  prompt: string;
  advisorModel: string;
  thinkingLevel: string;
  toolProfile: AdvisorToolProfile;
  allowReadOnlyBash: boolean;
}

export function buildAdvisorSubagentArgs(input: AdvisorSubagentArgsInput): string[] {
  const args = ["--mode", "json", "-p", "--no-session"];

  if (input.toolProfile === "strict") {
    args.push("--no-tools", "--no-extensions");
  } else {
    const tools = getAdvisorBuiltinTools("research", { allowReadOnlyBash: input.allowReadOnlyBash });
    args.push("--tools", tools.join(","), "--no-extensions", "-e", WEB_FETCH_EXTENSION_PATH);
  }

  args.push("--model", input.advisorModel, "--thinking", input.thinkingLevel, input.prompt);
  return args;
}

export interface RunAdvisorSubagentOptions extends AdvisorSubagentArgsInput {
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface AdvisorSubagentSuccess {
  ok: true;
  response: string;
}

export interface AdvisorSubagentFailure {
  ok: false;
  error: string;
}

export async function runAdvisorSubagent(
  options: RunAdvisorSubagentOptions,
): Promise<AdvisorSubagentSuccess | AdvisorSubagentFailure> {
  if (options.signal?.aborted) {
    return { ok: false, error: "Aborted" };
  }

  const args = buildAdvisorSubagentArgs(options);

  return new Promise((resolve) => {
    const proc = spawn("pi", args, {
      cwd: options.cwd,
      env: { ...process.env, PI_ADVISOR_SUBAGENT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderr = "";
    let assistantText = "";
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killProcess(proc);
    }, options.timeoutMs);

    const onAbort = () => {
      killProcess(proc);
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });

    const processLine = (line: string) => {
      const text = extractAssistantText(line);
      if (text) assistantText = text;
    };

    proc.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onAbort);

      if (stdoutBuffer.trim()) {
        processLine(stdoutBuffer);
      }

      if (options.signal?.aborted) {
        resolve({ ok: false, error: "Aborted" });
        return;
      }

      if (timedOut) {
        resolve({ ok: false, error: `Advisor subprocess timed out after ${options.timeoutMs}ms` });
        return;
      }

      if (assistantText.trim()) {
        resolve({ ok: true, response: assistantText.trim() });
        return;
      }

      if (code !== 0) {
        resolve({ ok: false, error: `Advisor subprocess failed (exit code ${code}): ${stderr.trim() || "(no output)"}` });
        return;
      }

      resolve({ ok: false, error: "Advisor subprocess returned no response" });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ ok: false, error: `Failed to spawn advisor subprocess: ${err.message}` });
    });
  });
}

export { WEB_FETCH_EXTENSION_PATH };
