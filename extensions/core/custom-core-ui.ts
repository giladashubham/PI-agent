import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const DEFAULT_BANNER = `                             ▄▄   
█████▄ ▄████▄ ▄████▄ █████▄ ▄██▄▄▄
▄▄▄▄██ ██  ██ ██▄▄██ ██  ██ ▀██▀▀▀
██▄▄██ ██▄▄██ ██▄▄▄▄ ██  ██  ██▄▄▄
 ▀▀▀▀▀  ▀▀▀██  ▀▀▀▀▀ ▀▀  ▀▀   ▀▀▀▀
        ████▀                     `;

const PI_AGENT_DIR = join(homedir(), ".pi", "agent");
const SETTINGS_PATH = join(PI_AGENT_DIR, "settings.json");
const BANNER_PATHS = [
  join(PI_AGENT_DIR, "agent-banner.txt"),
  join(homedir(), "Desktop", "agent.txt"),
];
const PLAN_STATE_ENTRY = "question-first-plan-mode";

function loadBannerArt(): string {
  for (const path of BANNER_PATHS) {
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, "utf8").trimEnd();
      if (text.trim()) return text;
    } catch {
      // ignore and keep trying fallbacks
    }
  }
  return DEFAULT_BANNER;
}

function showBanner(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;

  const lines = loadBannerArt().split("\n");
  ctx.ui.setWidget(
    "custom-core-ui-banner",
    (_tui, theme) => ({
      invalidate() {},
      render(): string[] {
        return [...lines.map((line) => theme.fg("accent", line)), ""];
      },
    }),
    { placement: "aboveEditor" },
  );
}

function hideBanner(ctx: ExtensionContext | undefined) {
  if (!ctx?.hasUI) return;
  ctx.ui.setWidget("custom-core-ui-banner", undefined);
}

function shortModelName(name: string | undefined): string {
  if (!name) return "no model";
  const cleaned = name.replace(/^claude\s*/i, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const versions: string[] = [];
  const words: string[] = [];

  for (const token of tokens) {
    if (/^[\d.]+$/.test(token)) versions.push(token);
    else words.push(token.toLowerCase());
  }

  return [...words, ...versions].join(" ") || name.toLowerCase();
}

function formatTokens(n: number): string {
  if (n < 1_000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  const m = n / 1_000_000;
  return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
}

function shortDir(cwd: string): string {
  const child = basename(cwd);
  const parent = basename(dirname(cwd));
  return parent ? `${parent}/${child}` : child;
}

function thinkingIndicator(level: string | undefined, theme: any): string {
  const value = level || "off";
  const color = value === "off"
    ? "dim"
    : value === "high" || value === "xhigh"
      ? "warning"
      : "accent";
  return theme.fg("dim", "thinking: ") + theme.fg(color, theme.bold(value));
}

function isPlanModeActive(ctx: ExtensionContext): boolean {
  try {
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i] as { type?: string; customType?: string; data?: { enabled?: boolean } };
      if (entry.type === "custom" && entry.customType === PLAN_STATE_ENTRY) {
        return entry.data?.enabled === true;
      }
    }
  } catch {
    // not available
  }
  return false;
}

function installFooter(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (!ctx.hasUI) return;

  ctx.ui.setFooter((_tui, theme) => ({
    invalidate() {},
    render(width: number): string[] {
      const usage = ctx.getContextUsage();
      const model = shortModelName(ctx.model?.name);
      const contextWindow = ctx.model?.contextWindow || 0;
      const dir = shortDir(ctx.cwd);

      let usageText = "–";
      if (usage?.percent != null) {
        const percent = `${Math.round(usage.percent)}%`;
        usageText = contextWindow > 0
          ? `${percent} / ${formatTokens(contextWindow)}`
          : percent;
      }

      const planBadge = isPlanModeActive(ctx)
        ? theme.fg("warning", theme.bold(" PLAN"))
        : "";
      const sep = theme.fg("dim", " | ");
      const left =
        " " +
        theme.fg("accent", theme.bold(model)) +
        sep +
        theme.fg("dim", usageText) +
        sep +
        theme.fg("dim", dir);
      const right = thinkingIndicator(pi.getThinkingLevel?.(), theme) + planBadge + " ";
      const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
      return [truncateToWidth(left + " ".repeat(gap) + right, width, "")];
    },
  }));
}

function updateThemeStatus(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("custom-core-ui-theme", ctx.ui.theme.name);
}

function readSettings(): Record<string, unknown> {
  try {
    if (!existsSync(SETTINGS_PATH)) return {};
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function persistTheme(name: string) {
  try {
    mkdirSync(PI_AGENT_DIR, { recursive: true });
    const settings = readSettings();
    settings.theme = name;
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
  } catch {
    // best effort only
  }
}

function showThemeSwatch(ctx: ExtensionContext, clearPrevious: () => void, rememberTimer: (timer: ReturnType<typeof setTimeout> | null) => void) {
  if (!ctx.hasUI) return;

  clearPrevious();
  ctx.ui.setWidget(
    "custom-core-ui-theme-swatch",
    (_tui, theme) => ({
      invalidate() {},
      render(width: number): string[] {
        const block = "\u2588\u2588\u2588";
        const swatch = [
          theme.fg("success", block),
          theme.fg("accent", block),
          theme.fg("warning", block),
          theme.fg("muted", block),
          theme.fg("dim", block),
        ].join(" ");
        const label = `${theme.fg("accent", " Theme ")}${theme.fg("muted", ctx.ui.theme.name)}  ${swatch}`;
        const border = theme.fg("borderMuted", "─".repeat(Math.max(0, width)));
        return [border, truncateToWidth("  " + label, width), border];
      },
    }),
    { placement: "belowEditor" },
  );

  const timer = setTimeout(() => {
    ctx.ui.setWidget("custom-core-ui-theme-swatch", undefined);
    rememberTimer(null);
  }, 3000);
  rememberTimer(timer);
}

function cycleTheme(
  ctx: ExtensionContext,
  direction: 1 | -1,
  clearPrevious: () => void,
  rememberTimer: (timer: ReturnType<typeof setTimeout> | null) => void,
) {
  if (!ctx.hasUI) return;

  const themes = ctx.ui.getAllThemes();
  if (themes.length === 0) {
    ctx.ui.notify("No themes available", "warning");
    return;
  }

  let index = themes.findIndex((theme) => theme.name === ctx.ui.theme.name);
  if (index < 0) index = 0;
  index = (index + direction + themes.length) % themes.length;

  const nextTheme = themes[index];
  const result = ctx.ui.setTheme(nextTheme.name);
  if (!result.success) {
    ctx.ui.notify(`Failed to set theme: ${result.error}`, "error");
    return;
  }

  persistTheme(nextTheme.name);
  updateThemeStatus(ctx);
  showThemeSwatch(ctx, clearPrevious, rememberTimer);
  ctx.ui.notify(`${nextTheme.name} (${index + 1}/${themes.length})`, "info");
}

export default function customCoreUi(pi: ExtensionAPI) {
  let lastCtx: ExtensionContext | undefined;
  let swatchTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSwatchTimer = () => {
    if (swatchTimer) {
      clearTimeout(swatchTimer);
      swatchTimer = null;
    }
  };

  const rememberTimer = (timer: ReturnType<typeof setTimeout> | null) => {
    swatchTimer = timer;
  };

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    showBanner(ctx);
    installFooter(pi, ctx);
    updateThemeStatus(ctx);
  });

  pi.on("input", async () => {
    hideBanner(lastCtx);
  });

  pi.registerShortcut("ctrl+x", {
    description: "Cycle theme forward",
    handler: async (ctx) => {
      lastCtx = ctx;
      cycleTheme(ctx, 1, clearSwatchTimer, rememberTimer);
    },
  });

  pi.registerShortcut("ctrl+q", {
    description: "Cycle theme backward",
    handler: async (ctx) => {
      lastCtx = ctx;
      cycleTheme(ctx, -1, clearSwatchTimer, rememberTimer);
    },
  });

  pi.registerCommand("theme", {
    description: "Select a theme: /theme or /theme <name>",
    handler: async (args, ctx) => {
      lastCtx = ctx;
      if (!ctx.hasUI) return;

      const requested = (args || "").trim();
      if (requested) {
        const result = ctx.ui.setTheme(requested);
        if (!result.success) {
          ctx.ui.notify(`Theme not found: ${requested}`, "error");
          return;
        }
        persistTheme(requested);
        updateThemeStatus(ctx);
        showThemeSwatch(ctx, clearSwatchTimer, rememberTimer);
        ctx.ui.notify(`Theme: ${requested}`, "info");
        return;
      }

      const names = ctx.ui.getAllThemes().map((theme) => theme.name);
      const selected = await ctx.ui.select("Select Theme", names);
      if (!selected) return;

      const result = ctx.ui.setTheme(selected);
      if (!result.success) {
        ctx.ui.notify(`Failed to set theme: ${result.error}`, "error");
        return;
      }

      persistTheme(selected);
      updateThemeStatus(ctx);
      showThemeSwatch(ctx, clearSwatchTimer, rememberTimer);
      ctx.ui.notify(`Theme: ${selected}`, "info");
    },
  });

  pi.on("session_shutdown", async () => {
    clearSwatchTimer();
  });
}
