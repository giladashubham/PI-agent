import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { BANNER_PATHS } from "../../../src/shared/paths.js";

const DEFAULT_BANNER = `                             ▄▄   
█████▄ ▄████▄ ▄████▄ █████▄ ▄██▄▄▄
▄▄▄▄██ ██  ██ ██▄▄██ ██  ██ ▀██▀▀▀
██▄▄██ ██▄▄██ ██▄▄▄▄ ██  ██  ██▄▄▄
 ▀▀▀▀▀  ▀▀▀██  ▀▀▀▀▀ ▀▀  ▀▀   ▀▀▀▀
        ████▀                     `;

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

export function showBanner(ctx: ExtensionContext): void {
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

export function hideBanner(ctx: ExtensionContext | undefined): void {
  if (!ctx?.hasUI) return;
  ctx.ui.setWidget("custom-core-ui-banner", undefined);
}
