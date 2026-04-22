import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { readJsonObject, readConfigSection } from "../../../src/shared/config.js";
import { BANNER_PATHS, CUSTOM_CONFIG_PATH, SETTINGS_PATH } from "../../../src/shared/paths.js";

const DEFAULT_BANNER = `                             ▄▄   
█████▄ ▄████▄ ▄████▄ █████▄ ▄██▄▄▄
▄▄▄▄██ ██  ██ ██▄▄██ ██  ██ ▀██▀▀▀
██▄▄██ ██▄▄██ ██▄▄▄▄ ██  ██  ██▄▄▄
 ▀▀▀▀▀  ▀▀▀██  ▀▀▀▀▀ ▀▀  ▀▀   ▀▀▀▀
        ████▀                     `;
const LEGACY_BANNER_SETTING_KEY = "customCoreUiBanner";

export function readBannerEnabled(): boolean {
  const custom = readJsonObject(CUSTOM_CONFIG_PATH);
  const ui = readConfigSection(custom, "ui");
  if (typeof ui?.banner === "boolean") {
    return ui.banner as boolean;
  }

  const settings = readJsonObject(SETTINGS_PATH);
  return typeof settings?.[LEGACY_BANNER_SETTING_KEY] === "boolean"
    ? Boolean(settings[LEGACY_BANNER_SETTING_KEY])
    : false;
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
