import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { formatTokens } from "../../../src/shared/formatting.js";
import { type FooterTone, footerGlyphs } from "./nerd-fonts.js";
import { basename, dirname } from "node:path";

const PLAN_STATE_ENTRY = "question-first-plan-mode";

interface FooterSegment {
  text: string;
  color?: FooterTone;
  bold?: boolean;
  formatter?: (theme: any, text: string) => string;
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
  return "muted";
}

function subtleAnsi256(code: number, text: string): string {
  return `\x1b[38;5;${code}m${text}\x1b[39m`;
}

function formatContextUsage(theme: any, text: string, percent: number | undefined): string {
  if (percent == null) return theme.fg("dim", text);
  if (percent > 80) return subtleAnsi256(131, text);
  if (percent > 40) return subtleAnsi256(179, text);
  return theme.fg("muted", text);
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
      const content = segment.formatter ? segment.formatter(theme, text) : theme.fg(segment.color ?? "text", text);
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

export function installFooter(pi: ExtensionAPI, ctx: ExtensionContext): void {
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

        const leftSegments: FooterSegment[] = [
          { text: `${glyphs.dir} ${dir}`, color: "dim" },
          ...(gitBranch ? [{ text: `${glyphs.git} ${gitBranch}`, color: "success" as const }] : []),
        ];

        const rightSegments: FooterSegment[] = [
          { text: `${glyphs.model} ${model}`, color: "accent", bold: true },
          {
            text: `${glyphs.context} ${usageText}`,
            color: contextTone(usagePercent),
            formatter: (theme, text) => formatContextUsage(theme, text, usagePercent),
          },
          {
            text: `${glyphs.thinking} ${compactThinkingLevel(thinkingLevel)}`,
            color: thinkingTone(thinkingLevel),
            bold: thinkingLevel !== "off",
          },
        ];

        if (isPlanModeActive(ctx)) {
          rightSegments.push({ text: `${glyphs.plan} PLAN`, color: "warning", bold: true });
        }

        const left = " " + renderFooterSegments(theme, glyphs.separator, leftSegments);
        const right = renderFooterSegments(theme, glyphs.separator, rightSegments) + " ";
        const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
        return [truncateToWidth(left + " ".repeat(gap) + right, width, "")];
      },
    };
  });
}
