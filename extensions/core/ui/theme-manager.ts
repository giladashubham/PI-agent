import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { readJsonObject, readConfigSection, writeJsonConfig } from "../../../src/shared/config.js";
import { SETTINGS_PATH, CUSTOM_CONFIG_PATH } from "../../../src/shared/paths.js";

const DEFAULT_THEME_NAME = "codex-black";
const LEGACY_BANNER_SETTING_KEY = "customCoreUiBanner";

export function readSavedThemeName(): string | undefined {
  const custom = readJsonObject(CUSTOM_CONFIG_PATH);
  const ui = readConfigSection(custom, "ui");
  if (typeof ui?.theme === "string" && (ui.theme as string).trim()) {
    return (ui.theme as string).trim();
  }

  const settings = readJsonObject(SETTINGS_PATH);
  if (typeof settings?.theme === "string" && (settings.theme as string).trim()) {
    return (settings.theme as string).trim();
  }

  return DEFAULT_THEME_NAME;
}

export function readBannerEnabled(): boolean {
  const custom = readJsonObject(CUSTOM_CONFIG_PATH);
  const ui = readConfigSection(custom, "ui");
  if (typeof ui?.banner === "boolean") {
    return ui.banner as boolean;
  }

  const settings = readJsonObject(SETTINGS_PATH);
  return typeof settings?.[LEGACY_BANNER_SETTING_KEY] === "boolean" ? Boolean(settings[LEGACY_BANNER_SETTING_KEY]) : false;
}

export function persistTheme(name: string): void {
  const config = readJsonObject(CUSTOM_CONFIG_PATH) ?? {};
  const ui = readConfigSection(config, "ui") ?? {};
  (ui as Record<string, unknown>).theme = name;
  config.ui = ui;
  writeJsonConfig(CUSTOM_CONFIG_PATH, config);
}

export function applySavedTheme(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const savedTheme = readSavedThemeName();
  if (!savedTheme || savedTheme === ctx.ui.theme.name) return;

  const result = ctx.ui.setTheme(savedTheme);
  if (!result.success) {
    ctx.ui.notify(`Saved theme not found: ${savedTheme}`, "warning");
  }
}

export function updateThemeStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("custom-core-ui-theme", ctx.ui.theme.name);
}

export function showThemeSwatch(
  ctx: ExtensionContext,
  clearPrevious: () => void,
  rememberTimer: (timer: ReturnType<typeof setTimeout> | null) => void,
): void {
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

export function cycleTheme(
  ctx: ExtensionContext,
  direction: 1 | -1,
  clearPrevious: () => void,
  rememberTimer: (timer: ReturnType<typeof setTimeout> | null) => void,
): void {
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
