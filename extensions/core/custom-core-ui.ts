import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { installInputEditor } from "./ui/input-editor.js";
import { showBanner, hideBanner } from "./ui/banner.js";
import { type RunSummary, summarizeAssistantUsage } from "./ui/run-summary.js";
import {
  type ChangedFileEntry,
  formatChangedFilePath,
  countContentLines,
  parseDiffStats,
  upsertChangedFile,
  renderChangedFilesWidget,
} from "./ui/changed-files.js";
import {
  applySavedTheme,
  readBannerEnabled,
  updateThemeStatus,
  cycleTheme,
  persistTheme,
  showThemeSwatch,
} from "./ui/theme-manager.js";
import {
  type FooterPreset,
  isFooterPreset,
  readFooterPreset,
  persistFooterPreset,
  installFooter,
} from "./ui/footer.js";

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
    installInputEditor(ctx);
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
        const selected = await ctx.ui.select("Status Bar Preset", ["default", "minimal", "compact", "codex"]);
        if (!selected || !isFooterPreset(selected)) return;
        footerPreset = selected;
      } else if (isFooterPreset(requested)) {
        footerPreset = requested;
      } else {
        ctx.ui.notify("Unknown preset: " + requested, "error");
        return;
      }

      persistFooterPreset(footerPreset);
      installFooter(pi, ctx, footerPreset, () => lastRunSummary);
      ctx.ui.notify("Status bar preset: " + footerPreset, "info");
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
          ctx.ui.notify("Theme not found: " + requested, "error");
          return;
        }
        persistTheme(requested);
        updateThemeStatus(ctx);
        showThemeSwatch(ctx, clearSwatchTimer, rememberTimer);
        ctx.ui.notify("Theme: " + requested, "info");
        return;
      }

      const names = ctx.ui.getAllThemes().map((theme) => theme.name);
      const selected = await ctx.ui.select("Select Theme", names);
      if (!selected) return;

      const result = ctx.ui.setTheme(selected);
      if (!result.success) {
        ctx.ui.notify("Failed to set theme: " + result.error, "error");
        return;
      }

      persistTheme(selected);
      updateThemeStatus(ctx);
      showThemeSwatch(ctx, clearSwatchTimer, rememberTimer);
      ctx.ui.notify("Theme: " + selected, "info");
    },
  });

  pi.on("session_shutdown", async () => {
    clearSwatchTimer();
  });
}
