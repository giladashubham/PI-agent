import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { relative, basename } from "node:path";

const CHANGED_FILES_WIDGET_KEY = "custom-core-ui-changed-files";
const MAX_RECENT_CHANGED_FILES = 6;

export type ChangedFileOperation = "edit" | "write";

export interface ChangedFileEntry {
  path: string;
  op: ChangedFileOperation;
  count: number;
  added: number;
  removed: number;
}

export function formatChangedFilePath(cwd: string, path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (!trimmed.startsWith("/")) return trimmed.replace(/\\/g, "/");

  const relPath = relative(cwd, trimmed).replace(/\\/g, "/");
  if (!relPath || relPath === ".") return basename(trimmed);
  return relPath.startsWith("../") ? trimmed : relPath;
}

export function countContentLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}

export function parseDiffStats(diff: string | undefined): { added: number; removed: number } {
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

export function upsertChangedFile(
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

export function renderChangedFilesWidget(ctx: ExtensionContext, entries: ChangedFileEntry[]): void {
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
