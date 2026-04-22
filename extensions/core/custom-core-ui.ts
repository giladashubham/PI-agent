import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { installInputEditor } from "./ui/input-editor.js";
import { showBanner, hideBanner, readBannerEnabled } from "./ui/banner.js";
import {
  type ChangedFileEntry,
  formatChangedFilePath,
  countContentLines,
  parseDiffStats,
  upsertChangedFile,
  renderChangedFilesWidget,
} from "./ui/changed-files.js";
import { installFooter } from "./ui/footer.js";

export default function customCoreUi(pi: ExtensionAPI) {
  let lastCtx: ExtensionContext | undefined;
  let changedFiles: ChangedFileEntry[] = [];

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    changedFiles = [];
    installInputEditor(ctx);
    if (readBannerEnabled()) showBanner(ctx);
    else hideBanner(ctx);
    renderChangedFilesWidget(ctx, changedFiles);
    installFooter(pi, ctx);
  });

  pi.on("agent_start", async () => {
    changedFiles = [];
    if (lastCtx?.hasUI) {
      renderChangedFilesWidget(lastCtx, changedFiles);
      installFooter(pi, lastCtx);
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

  pi.on("agent_end", async (_event, ctx) => {
    lastCtx = ctx;
    if (!ctx.hasUI) return;

    renderChangedFilesWidget(ctx, changedFiles);
    installFooter(pi, ctx);
  });

  pi.on("input", async () => {
    hideBanner(lastCtx);
    if (lastCtx?.hasUI) {
      renderChangedFilesWidget(lastCtx, []);
      installFooter(pi, lastCtx);
    }
  });
}
