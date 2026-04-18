import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { readJsonObject, readConfigSection, writeJsonConfig } from "../../../src/shared/config.js";
import { SETTINGS_PATH, CUSTOM_CONFIG_PATH } from "../../../src/shared/paths.js";
import { formatTokens } from "../../../src/shared/formatting.js";
import { type FooterTone, type FooterGlyphs, footerGlyphs } from "./nerd-fonts.js";
import { type RunSummary, formatRunSummary } from "./run-summary.js";
import { basename, dirname } from "node:path";

const FOOTER_PRESETS = ["default", "minimal", "compact", "codex"] as const;
export type FooterPreset = (typeof FOOTER_PRESETS)[number];
export const DEFAULT_FOOTER_PRESET: FooterPreset = "codex";
const LEGACY_FOOTER_PRESET_SETTING_KEY = "customCoreUiFooterPreset";
const PLAN_STATE_ENTRY = "question-first-plan-mode";

interface FooterSegment {
  text: string;
  color: FooterTone;
  bold?: boolean;
}

export function isFooterPreset(value: unknown): value is FooterPreset {
  return typeof value === "string" && FOOTER_PRESETS.some((preset) => preset === value);
}

export function readFooterPreset(): FooterPreset {
  const custom = readJsonObject(CUSTOM_CONFIG_PATH);
  const ui = readConfigSection(custom, "ui");
  if (isFooterPreset(ui?.footerPreset)) {
    return ui!.footerPreset as FooterPreset;
  }

  const settings = readJsonObject(SETTINGS_PATH);
  const legacyPreset = settings?.[LEGACY_FOOTER_PRESET_SETTING_KEY];
  return isFooterPreset(legacyPreset) ? legacyPreset : DEFAULT_FOOTER_PRESET;
}

export function persistFooterPreset(preset: FooterPreset): void {
  const config = readJsonObject(CUSTOM_CONFIG_PATH) ?? {};
  const ui = readConfigSection(config, "ui") ?? {};
  (ui as Record<string, unknown>).footerPreset = preset;
  config.ui = ui;
  writeJsonConfig(CUSTOM_CONFIG_PATH, config);
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

function shortDir(cwd: string): string {
  const child = basename(cwd);
  const parent = basename(dirname(cwd));
  return parent ? `${parent}/${child}` : child;
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

export function installFooter(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  preset: FooterPreset,
  getRunSummary: () => RunSummary | undefined,
): void {
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
