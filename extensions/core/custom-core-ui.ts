import { CustomEditor, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CURSOR_MARKER, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename, dirname, join, relative } from "node:path";
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
const DEFAULT_THEME_NAME = "codex-black";
const INPUT_BG = "\x1b[48;2;18;18;18m";
const INPUT_FG = "\x1b[38;2;230;237;243m";
const INPUT_DIM = "\x1b[38;2;110;118;129m";
const INPUT_ACCENT = "\x1b[38;2;88;166;255m";
const ANSI_RESET = "\x1b[0m";
const INPUT_PLACEHOLDER = "Type @ to mention files, / for commands";
const FOOTER_PRESETS = ["default", "minimal", "compact", "codex"] as const;
type FooterPreset = (typeof FOOTER_PRESETS)[number];
const DEFAULT_FOOTER_PRESET: FooterPreset = "codex";
const LEGACY_FOOTER_PRESET_SETTING_KEY = "customCoreUiFooterPreset";
const LEGACY_BANNER_SETTING_KEY = "customCoreUiBanner";
const CHANGED_FILES_WIDGET_KEY = "custom-core-ui-changed-files";
const MAX_RECENT_CHANGED_FILES = 6;

interface RunSummary {
  durationMs: number;
  totalTokens: number;
  totalCost: number;
  modelCount: number;
  changedFileCount: number;
}

function ansi(color: string, text: string): string {
  return `${color}${text}${ANSI_RESET}`;
}

function styleInputBar(content: string, width: number): string {
  const safeWidth = Math.max(1, width);
  const normalized = `${INPUT_FG}${content}`.replaceAll("\x1b[0m", `${ANSI_RESET}${INPUT_BG}${INPUT_FG}`);
  const padded = truncateToWidth(normalized, safeWidth, "");
  const pad = " ".repeat(Math.max(0, safeWidth - visibleWidth(padded)));
  return `${INPUT_BG}${padded}${pad}${ANSI_RESET}`;
}

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const OSC_SEQUENCE_PATTERN = new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "g");
const ANSI_SEQUENCE_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");

function stripTerminalCodes(text: string): string {
  return text.replaceAll(CURSOR_MARKER, "").replace(OSC_SEQUENCE_PATTERN, "").replace(ANSI_SEQUENCE_PATTERN, "");
}

function isEditorBorderLine(line: string): boolean {
  const plain = stripTerminalCodes(line).trim();
  return /^─+$/.test(plain) || /^─── [↑↓] \d+ more ─*$/.test(plain);
}

class ScreenshotInputEditor extends CustomEditor {
  override render(width: number): string[] {
    const innerWidth = Math.max(1, width - 4);
    const rawLines = super.render(innerWidth);
    const contentLines = rawLines.filter((line) => !isEditorBorderLine(line));
    const prefix = `${ansi(INPUT_ACCENT, "❯")} `;

    if (!this.getText() && !this.isShowingAutocomplete()) {
      const marker = this.focused ? CURSOR_MARKER : "";
      const cursor = this.focused ? "\x1b[7m \x1b[0m" : "";
      const placeholder = ansi(INPUT_DIM, INPUT_PLACEHOLDER);
      return [
        styleInputBar("", width),
        styleInputBar(` ${prefix}${marker}${cursor}${placeholder}`, width),
        styleInputBar("", width),
      ];
    }

    const lines = [styleInputBar("", width)];
    const visibleLines = contentLines.length > 0 ? contentLines : [""];
    for (let i = 0; i < visibleLines.length; i++) {
      const line = i === 0 ? ` ${prefix}${visibleLines[i]}` : `   ${visibleLines[i]}`;
      lines.push(styleInputBar(line, width));
    }
    lines.push(styleInputBar("", width));
    return lines;
  }
}

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

type ChangedFileOperation = "edit" | "write";

interface ChangedFileEntry {
  path: string;
  op: ChangedFileOperation;
  count: number;
  added: number;
  removed: number;
}

function formatChangedFilePath(cwd: string, path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (!trimmed.startsWith("/")) return trimmed.replace(/\\/g, "/");

  const relPath = relative(cwd, trimmed).replace(/\\/g, "/");
  if (!relPath || relPath === ".") return basename(trimmed);
  return relPath.startsWith("../") ? trimmed : relPath;
}

function countContentLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}

function parseDiffStats(diff: string | undefined): { added: number; removed: number } {
  if (!diff) return { added: 0, removed: 0 };

  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }

  return { added, removed };
}

function upsertChangedFile(
  entries: ChangedFileEntry[],
  path: string,
  op: ChangedFileOperation,
  stats: { added?: number; removed?: number } = {},
): ChangedFileEntry[] {
  const normalizedPath = path.trim();
  if (!normalizedPath) return entries;

  const next = [...entries];
  const existingIndex = next.findIndex((entry) => entry.path === normalizedPath);
  const existing = existingIndex >= 0 ? next.splice(existingIndex, 1)[0] : undefined;
  next.unshift({
    path: normalizedPath,
    op,
    count: (existing?.count || 0) + 1,
    added: (existing?.added || 0) + (stats.added || 0),
    removed: (existing?.removed || 0) + (stats.removed || 0),
  });
  return next.slice(0, MAX_RECENT_CHANGED_FILES);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatMoney(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(3)}`;
  return "$0.00";
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

function summarizeAssistantUsage(messages: unknown): Omit<RunSummary, "durationMs" | "changedFileCount"> {
  const items = Array.isArray(messages) ? messages : [];
  let totalTokens = 0;
  let totalCost = 0;
  const models = new Set<string>();

  for (const item of items) {
    const message = item as {
      role?: string;
      model?: string;
      usage?: { totalTokens?: number; cost?: { total?: number } };
    };
    if (message.role !== "assistant") continue;
    totalTokens += message.usage?.totalTokens || 0;
    totalCost += message.usage?.cost?.total || 0;
    if (message.model) models.add(message.model);
  }

  return {
    totalTokens,
    totalCost,
    modelCount: models.size,
  };
}

function formatRunSummary(summary: RunSummary): string {
  const parts = [
    `Done ${formatDuration(summary.durationMs)}`,
    `${summary.changedFileCount} file${summary.changedFileCount === 1 ? "" : "s"}`,
  ];
  if (summary.modelCount > 0) parts.push(`${summary.modelCount} model${summary.modelCount === 1 ? "" : "s"}`);
  if (summary.totalTokens > 0) parts.push(`${formatCompactNumber(summary.totalTokens)} tok`);
  parts.push(formatMoney(summary.totalCost));
  return parts.join(" · ");
}

function renderChangedFilesWidget(ctx: ExtensionContext, entries: ChangedFileEntry[]) {
  if (!ctx.hasUI) return;

  if (entries.length === 0) {
    ctx.ui.setWidget(CHANGED_FILES_WIDGET_KEY, undefined);
    return;
  }

  ctx.ui.setWidget(
    CHANGED_FILES_WIDGET_KEY,
    (_tui, theme) => ({
      invalidate() {},
      render(width: number): string[] {
        const lines: string[] = [];
        let topRow = "";
        let midRow = "";
        let bottomRow = "";

        const flush = () => {
          if (!topRow) return;
          lines.push(topRow, midRow, bottomRow);
          topRow = "";
          midRow = "";
          bottomRow = "";
        };

        for (const entry of entries) {
          const added = entry.added > 0 ? theme.fg("success", `+${entry.added}`) : "";
          const removed = entry.removed > 0 ? theme.fg("error", `-${entry.removed}`) : "";
          const repeats = entry.count > 1 ? theme.fg("dim", ` ×${entry.count}`) : "";
          const stats = [added, removed].filter(Boolean).join(" ");
          const content = [` ${entry.path}`, stats ? ` ${stats}` : "", repeats, " "].join("");
          const contentWidth = visibleWidth(content);
          const chipTop = theme.fg("borderMuted", `╭${"─".repeat(contentWidth)}╮`);
          const chipMid = `${theme.fg("borderMuted", "│")}${content}${theme.fg("borderMuted", "│")}`;
          const chipBottom = theme.fg("borderMuted", `╰${"─".repeat(contentWidth)}╯`);
          const separator = topRow ? " " : "";
          const nextWidth = visibleWidth(topRow) + visibleWidth(separator) + visibleWidth(chipTop);

          if (topRow && nextWidth > width) {
            flush();
          }

          const joiner = topRow ? " " : "";
          topRow += joiner + chipTop;
          midRow += joiner + chipMid;
          bottomRow += joiner + chipBottom;
        }

        flush();
        return lines.map((line) => truncateToWidth(line, width));
      },
    }),
    { placement: "belowEditor" },
  );
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
    runSummary?: RunSummary;
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

  const runSummarySegment: FooterSegment | null = parts.runSummary
    ? { text: `✓ ${formatRunSummary(parts.runSummary)}`, color: "success", bold: true }
    : null;

  let left: FooterSegment[];
  let right: FooterSegment[] = runSummarySegment ? [runSummarySegment] : [thinkingSegment];
  switch (preset) {
    case "minimal":
      left = [dirSegment, gitSegment, contextSegment].filter((segment): segment is FooterSegment => segment !== null);
      break;
    case "compact":
      left = [modelSegment, gitSegment, contextSegment].filter((segment): segment is FooterSegment => segment !== null);
      break;
    case "codex":
      left = [dirSegment, gitSegment].filter((segment): segment is FooterSegment => segment !== null);
      right = runSummarySegment ? [runSummarySegment] : [modelSegment, contextSegment, thinkingSegment];
      break;
    case "default":
    default:
      left = [modelSegment, gitSegment, contextSegment, dirSegment].filter((segment): segment is FooterSegment => segment !== null);
      if (runSummarySegment) right = [runSummarySegment];
      break;
  }

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

function installFooter(pi: ExtensionAPI, ctx: ExtensionContext, preset: FooterPreset, getRunSummary: () => RunSummary | undefined) {
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
          runSummary: getRunSummary(),
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
  if (typeof settings.theme === "string" && settings.theme.trim()) {
    return settings.theme.trim();
  }

  return DEFAULT_THEME_NAME;
}

function readFooterPreset(): FooterPreset {
  const custom = readCustomConfig();
  const ui = readUiConfig(custom);
  if (isFooterPreset(ui.footerPreset)) {
    return ui.footerPreset;
  }

  const settings = readSettings();
  const legacyPreset = settings[LEGACY_FOOTER_PRESET_SETTING_KEY];
  return isFooterPreset(legacyPreset) ? legacyPreset : DEFAULT_FOOTER_PRESET;
}

function readBannerEnabled(): boolean {
  const custom = readCustomConfig();
  const ui = readUiConfig(custom);
  if (typeof ui.banner === "boolean") {
    return ui.banner;
  }

  const settings = readSettings();
  return typeof settings[LEGACY_BANNER_SETTING_KEY] === "boolean" ? Boolean(settings[LEGACY_BANNER_SETTING_KEY]) : false;
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
  let changedFiles: ChangedFileEntry[] = [];
  let lastRunSummary: RunSummary | undefined;
  let agentStartedAt = 0;

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
    changedFiles = [];
    lastRunSummary = undefined;
    agentStartedAt = 0;
    applySavedTheme(ctx);
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new ScreenshotInputEditor(tui, theme, keybindings));
    if (readBannerEnabled()) showBanner(ctx);
    else hideBanner(ctx);
    renderChangedFilesWidget(ctx, changedFiles);
    installFooter(pi, ctx, footerPreset, () => lastRunSummary);
    updateThemeStatus(ctx);
  });

  pi.on("agent_start", async () => {
    changedFiles = [];
    lastRunSummary = undefined;
    agentStartedAt = Date.now();
    if (lastCtx?.hasUI) {
      renderChangedFilesWidget(lastCtx, changedFiles);
      installFooter(pi, lastCtx, footerPreset, () => lastRunSummary);
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    lastCtx = ctx;
    if (!ctx.hasUI || event.isError) return;
    if (event.toolName !== "edit" && event.toolName !== "write") return;

    const rawPath = event.input.path;
    if (typeof rawPath !== "string" || !rawPath.trim()) return;

    const path = formatChangedFilePath(ctx.cwd, rawPath);
    const stats =
      event.toolName === "edit"
        ? parseDiffStats((event.details as { diff?: string } | undefined)?.diff)
        : { added: countContentLines(typeof event.input.content === "string" ? event.input.content : ""), removed: 0 };

    changedFiles = upsertChangedFile(changedFiles, path, event.toolName, stats);
    renderChangedFilesWidget(ctx, changedFiles);
  });

  pi.on("agent_end", async (event, ctx) => {
    lastCtx = ctx;
    if (!ctx.hasUI) return;

    const usage = summarizeAssistantUsage(event.messages);
    lastRunSummary = {
      ...usage,
      durationMs: agentStartedAt > 0 ? Date.now() - agentStartedAt : 0,
      changedFileCount: changedFiles.length,
    };
    renderChangedFilesWidget(ctx, changedFiles);
    installFooter(pi, ctx, footerPreset, () => lastRunSummary);
  });

  pi.on("input", async () => {
    hideBanner(lastCtx);
    lastRunSummary = undefined;
    if (lastCtx?.hasUI) {
      renderChangedFilesWidget(lastCtx, []);
      installFooter(pi, lastCtx, footerPreset, () => lastRunSummary);
    }
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
    description: "Set status bar preset: /statusbar [default|minimal|compact|codex]",
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
      installFooter(pi, ctx, footerPreset, () => lastRunSummary);
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
