import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STATUS_KEY = "env-loader";
const DEFAULT_ENV_PATHS = [join(homedir(), ".pi", "agent", ".env")];
const GLOBAL_STATE_KEY = "__PI_AGENT_ENV_LOADER_STATE__";

type EnvLoaderGlobalState = {
  shellEnvKeys: Set<string>;
};

type ApplyEnvOptions = {
  overrideExisting?: boolean;
  preserveKeys?: ReadonlySet<string>;
};

function getGlobalState(): EnvLoaderGlobalState {
  const globalWithState = globalThis as typeof globalThis & {
    [GLOBAL_STATE_KEY]?: EnvLoaderGlobalState;
  };

  if (!globalWithState[GLOBAL_STATE_KEY]) {
    globalWithState[GLOBAL_STATE_KEY] = {
      shellEnvKeys: new Set(Object.keys(process.env)),
    };
  }

  return globalWithState[GLOBAL_STATE_KEY];
}

export interface ParsedDotEnv {
  vars: Record<string, string>;
  invalidLines: number;
}

export interface EnvApplyResult {
  applied: number;
  skipped: number;
}

export interface EnvLoadSummary {
  filesLoaded: number;
  keysLoaded: number;
  keysSkipped: number;
  invalidLines: number;
  errors: string[];
}

function parseValue(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return "";

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
    const inner = value.slice(1, -1);
    if (quote === '"') {
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return inner;
  }

  return value.replace(/\s+#.*$/, "").trim();
}

export function parseDotEnv(content: string): ParsedDotEnv {
  const vars: Record<string, string> = {};
  let invalidLines = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const noExport = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
    const eqIndex = noExport.indexOf("=");
    if (eqIndex <= 0) {
      invalidLines += 1;
      continue;
    }

    const key = noExport.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      invalidLines += 1;
      continue;
    }

    const rawValue = noExport.slice(eqIndex + 1);
    vars[key] = parseValue(rawValue);
  }

  return { vars, invalidLines };
}

export function applyEnvVars(vars: Record<string, string>, options?: ApplyEnvOptions): EnvApplyResult {
  const overrideExisting = options?.overrideExisting === true;
  const preserveKeys = options?.preserveKeys;
  let applied = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(vars)) {
    if (preserveKeys?.has(key)) {
      skipped += 1;
      continue;
    }

    if (!overrideExisting && process.env[key] !== undefined) {
      skipped += 1;
      continue;
    }

    process.env[key] = value;
    applied += 1;
  }

  return { applied, skipped };
}

export function loadEnvFiles(paths: string[], options?: ApplyEnvOptions): EnvLoadSummary {
  const summary: EnvLoadSummary = {
    filesLoaded: 0,
    keysLoaded: 0,
    keysSkipped: 0,
    invalidLines: 0,
    errors: [],
  };

  for (const path of paths) {
    if (!existsSync(path)) continue;

    try {
      const parsed = parseDotEnv(readFileSync(path, "utf-8"));
      const applied = applyEnvVars(parsed.vars, options);
      summary.filesLoaded += 1;
      summary.keysLoaded += applied.applied;
      summary.keysSkipped += applied.skipped;
      summary.invalidLines += parsed.invalidLines;
    } catch (error: any) {
      summary.errors.push(`${path}: ${error.message || String(error)}`);
    }
  }

  return summary;
}

export function loadDefaultEnvFiles(options?: ApplyEnvOptions): EnvLoadSummary {
  return loadEnvFiles(DEFAULT_ENV_PATHS, options);
}

export default function envLoaderExtension(pi: ExtensionAPI) {
  const summary = loadDefaultEnvFiles({
    overrideExisting: true,
    preserveKeys: getGlobalState().shellEnvKeys,
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    if (summary.filesLoaded > 0) {
      ctx.ui.setStatus(STATUS_KEY, `env: ${summary.keysLoaded} loaded`);
    } else {
      ctx.ui.setStatus(STATUS_KEY, "env: no .env file");
    }

    if (summary.invalidLines > 0) {
      ctx.ui.notify(`.env loader skipped ${summary.invalidLines} invalid line(s).`, "warning");
    }

    for (const error of summary.errors) {
      ctx.ui.notify(`.env loader error: ${error}`, "warning");
    }
  });
}
