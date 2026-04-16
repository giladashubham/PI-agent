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
const CUSTOM_CONFIG_PATH = join(PI_AGENT_DIR, "pi-agent-custom.json");
const BANNER_PATHS = [join(PI_AGENT_DIR, "agent-banner.txt"), join(homedir(), "Desktop", "agent.txt")];
const PLAN_STATE_ENTRY = "question-first-plan-mode";
const FOOTER_PRESETS = ["default", "minimal", "compact"] as const;
type FooterPreset = (typeof FOOTER_PRESETS)[number];
const LEGACY_FOOTER_PRESET_SETTING_KEY = "customCoreUiFooterPreset";

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

type FooterTone = "accent" | "dim" | "muted" | "warning" | "error" | "success";

interface FooterGlyphs {
  separator: string;
  model: string;
  context: string;
  dir: string;
  git: string;
  thinking: string;
  plan: string;
}

interface FooterSegment {
  text: string;
  color: FooterTone;
  bold?: boolean;
}

function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === "1") return true;
  if (process.env.POWERLINE_NERD_FONTS === "0") return false;

  if (process.env.GHOSTTY_RESOURCES_DIR || process.env.KITTY_WINDOW_ID) return true;

  const termProgram = (process.env.TERM_PROGRAM || "").toLowerCase();
  const lcTerminal = (process.env.LC_TERMINAL || "").toLowerCase();
  const term = (process.env.TERM || "").toLowerCase();
  return ["iterm", "wezterm", "kitty", "ghostty", "alacritty"].some(
    (value) => termProgram.includes(value) || lcTerminal.includes(value) || term.includes(value),
  );
}

function footerGlyphs(): FooterGlyphs {
  if (hasNerdFonts()) {
    return {
      separator: "\uE0B1",
      model: "\uEC19",
      context: "\uE70F",
      dir: "\uF115",
      git: "\uF126",
      thinking: "\uF085",
      plan: "\uF0E7",
    };
  }

  return {
    separator: "·",
    model: "◈",
    context: "◫",
    dir: "◉",
    git: "⎇",
    thinking: "◌",
    plan: "⚡",
  };
}

function contextTone(percent: number | undefined): FooterTone {
  if (percent == null) return "dim";
  if (percent >= 90) return "error";
  if (percent >= 70) return "warning";
  return "muted";
}

function compactThinkingLevel(level: string | undefined): string {
  const value = (level || "off").toLowerCase();
  if (value === "minimal") return "min";
  if (value === "medium") return "med";
  return value;
}

function thinkingTone(level: string | undefined): FooterTone {
  const value = (level || "off").toLowerCase();
  if (value === "off") return "dim";
  if (value === "high" || value === "xhigh") return "warning";
  return "accent";
}

function renderFooterSegments(theme: any, separator: string, segments: FooterSegment[]): string {
  const visible = segments.filter((segment) => segment.text.trim().length > 0);
  return visible
    .map((segment, index) => {
      const text = segment.bold ? theme.bold(segment.text) : segment.text;
      const content = theme.fg(segment.color, text);
      return index === 0 ? content : theme.fg("borderMuted", ` ${separator} `) + content;
    })
    .join("");
}

function compactBranchName(branch: string | null | undefined): string {
  if (!branch) return "";
  if (branch.length <= 28) return branch;
  return `${branch.slice(0, 27)}…`;
}

function isFooterPreset(value: unknown): value is FooterPreset {
  return typeof value === "string" && FOOTER_PRESETS.some((preset) => preset === value);
}

function resolveFooterSegments(
  preset: FooterPreset,
  parts: {
    model: string;
    usageText: string;
    usagePercent: number | undefined;
    dir: string;
    gitBranch: string;
    thinkingLevel: string | undefined;
    planActive: boolean;
    glyphs: FooterGlyphs;
  },
): { left: FooterSegment[]; right: FooterSegment[] } {
  const modelSegment: FooterSegment = { text: `${parts.glyphs.model} ${parts.model}`, color: "accent", bold: true };
  const contextSegment: FooterSegment = {
    text: `${parts.glyphs.context} ${parts.usageText}`,
    color: contextTone(parts.usagePercent),
  };
  const dirSegment: FooterSegment = { text: `${parts.glyphs.dir} ${parts.dir}`, color: "dim" };
  const gitSegment: FooterSegment | null = parts.gitBranch
    ? { text: `${parts.glyphs.git} ${parts.gitBranch}`, color: "success" }
    : null;
  const thinkingSegment: FooterSegment = {
    text: `${parts.glyphs.thinking} ${compactThinkingLevel(parts.thinkingLevel)}`,
    color: thinkingTone(parts.thinkingLevel),
    bold: parts.thinkingLevel !== "off",
  };

  let left: FooterSegment[];
  switch (preset) {
    case "minimal":
      left = [dirSegment, gitSegment, contextSegment].filter((segment): segment is FooterSegment => segment !== null);
      break;
    case "compact":
      left = [modelSegment, gitSegment, contextSegment].filter((segment): segment is FooterSegment => segment !== null);
      break;
    case "default":
    default:
      left = [modelSegment, gitSegment, contextSegment, dirSegment].filter((segment): segment is FooterSegment => segment !== null);
      break;
  }

  const right: FooterSegment[] = [thinkingSegment];
  if (parts.planActive) {
    right.push({ text: `${parts.glyphs.plan} PLAN`, color: "warning", bold: true });
  }

  return { left, right };
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

function installFooter(pi: ExtensionAPI, ctx: ExtensionContext, preset: FooterPreset) {
  if (!ctx.hasUI) return;

  const glyphs = footerGlyphs();

  ctx.ui.setFooter((tui, theme, footerData) => {
    const unsubscribeBranchChange = footerData.onBranchChange(() => {
      tui.requestRender();
    });

    return {
      invalidate() {},
      dispose() {
        unsubscribeBranchChange();
      },
      render(width: number): string[] {
        const usage = ctx.getContextUsage();
        const model = shortModelName(ctx.model?.name);
        const contextWindow = ctx.model?.contextWindow || 0;
        const dir = shortDir(ctx.cwd);
        const thinkingLevel = pi.getThinkingLevel?.();
        const gitBranch = compactBranchName(footerData.getGitBranch());

        const usagePercent = usage?.percent ?? undefined;
        const roundedPercent = usagePercent == null ? undefined : Math.round(usagePercent);
        const usageText =
          roundedPercent == null
            ? "--"
            : contextWindow > 0
              ? `${roundedPercent}%/${formatTokens(contextWindow)}`
              : `${roundedPercent}%`;

        const segments = resolveFooterSegments(preset, {
          model,
          usageText,
          usagePercent,
          dir,
          gitBranch,
          thinkingLevel,
          planActive: isPlanModeActive(ctx),
          glyphs,
        });

        const left = " " + renderFooterSegments(theme, glyphs.separator, segments.left);
        const right = renderFooterSegments(theme, glyphs.separator, segments.right) + " ";
        const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
        return [truncateToWidth(left + " ".repeat(gap) + right, width, "")];
      },
    };
  });
}

function updateThemeStatus(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("custom-core-ui-theme", ctx.ui.theme.name);
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse/IO errors
  }
  return {};
}

function readSettings(): Record<string, unknown> {
  return readJsonObject(SETTINGS_PATH);
}

function readCustomConfig(): Record<string, unknown> {
  return readJsonObject(CUSTOM_CONFIG_PATH);
}

function readUiConfig(config: Record<string, unknown>): Record<string, unknown> {
  const ui = config.ui;
  if (ui && typeof ui === "object" && !Array.isArray(ui)) {
    return ui as Record<string, unknown>;
  }
  return {};
}

function writeCustomConfig(config: Record<string, unknown>) {
  try {
    mkdirSync(PI_AGENT_DIR, { recursive: true });
    writeFileSync(CUSTOM_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  } catch {
    // best effort only
  }
}

function readSavedThemeName(): string | undefined {
  const custom = readCustomConfig();
  const ui = readUiConfig(custom);
  if (typeof ui.theme === "string" && ui.theme.trim()) {
    return ui.theme.trim();
  }

  const settings = readSettings();
  return typeof settings.theme === "string" && settings.theme.trim() ? settings.theme.trim() : undefined;
}

function readFooterPreset(): FooterPreset {
  const custom = readCustomConfig();
  const ui = readUiConfig(custom);
  if (isFooterPreset(ui.footerPreset)) {
    return ui.footerPreset;
  }

  const settings = readSettings();
  const legacyPreset = settings[LEGACY_FOOTER_PRESET_SETTING_KEY];
  return isFooterPreset(legacyPreset) ? legacyPreset : "default";
}

function persistTheme(name: string) {
  const config = readCustomConfig();
  const ui = readUiConfig(config);
  ui.theme = name;
  config.ui = ui;
  writeCustomConfig(config);
}

function persistFooterPreset(preset: FooterPreset) {
  const config = readCustomConfig();
  const ui = readUiConfig(config);
  ui.footerPreset = preset;
  config.ui = ui;
  writeCustomConfig(config);
}

function applySavedTheme(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;

  const savedTheme = readSavedThemeName();
  if (!savedTheme || savedTheme === ctx.ui.theme.name) return;

  const result = ctx.ui.setTheme(savedTheme);
  if (!result.success) {
    ctx.ui.notify(`Saved theme not found: ${savedTheme}`, "warning");
  }
}

function showThemeSwatch(
  ctx: ExtensionContext,
  clearPrevious: () => void,
  rememberTimer: (timer: ReturnType<typeof setTimeout> | null) => void,
) {
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
        const label = `${theme.fg("accent", " Theme ")}${theme.fg("muted", ctx.ui.theme.name ?? "(unknown)")}  ${swatch}`;
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
  let footerPreset: FooterPreset = readFooterPreset();

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
    footerPreset = readFooterPreset();
    applySavedTheme(ctx);
    showBanner(ctx);
    installFooter(pi, ctx, footerPreset);
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

  pi.registerCommand("statusbar", {
    description: "Set status bar preset: /statusbar [default|minimal|compact]",
    handler: async (args, ctx) => {
      lastCtx = ctx;
      if (!ctx.hasUI) return;

      const requested = (args || "").trim().toLowerCase();
      if (!requested) {
        const selected = await ctx.ui.select("Status Bar Preset", [...FOOTER_PRESETS]);
        if (!selected || !isFooterPreset(selected)) return;
        footerPreset = selected;
      } else if (isFooterPreset(requested)) {
        footerPreset = requested;
      } else {
        ctx.ui.notify(`Unknown preset: ${requested}`, "error");
        return;
      }

      persistFooterPreset(footerPreset);
      installFooter(pi, ctx, footerPreset);
      ctx.ui.notify(`Status bar preset: ${footerPreset}`, "info");
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
