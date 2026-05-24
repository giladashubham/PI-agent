import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { installInputEditor } from "./input-editor.js";
import { showBanner, hideBanner, readBannerEnabled } from "./banner.js";
import { installFooter } from "./footer.js";

const CHANGED_FILES_WIDGET_KEY = "custom-core-ui-changed-files";

function clearChangedFilesWidget(ctx: ExtensionContext | undefined): void {
  if (!ctx?.hasUI) return;
  ctx.ui.setWidget(CHANGED_FILES_WIDGET_KEY, undefined);
}

export default function customCoreUi(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    installInputEditor(ctx);
    if (readBannerEnabled()) showBanner(ctx);
    else hideBanner(ctx);
    clearChangedFilesWidget(ctx);
    installFooter(pi, ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    hideBanner(ctx);
    clearChangedFilesWidget(ctx);
    ctx.ui.setFooter(undefined);
  });

  pi.on("agent_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    clearChangedFilesWidget(ctx);
    installFooter(pi, ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    clearChangedFilesWidget(ctx);
    installFooter(pi, ctx);
  });

  pi.on("input", async (_event, ctx) => {
    hideBanner(ctx);
    clearChangedFilesWidget(ctx);
    if (!ctx.hasUI) return;
    installFooter(pi, ctx);
  });
}
