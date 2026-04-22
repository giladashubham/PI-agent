import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readJsonObject } from "../../../src/shared/config.js";
import { CUSTOM_CONFIG_PATH, SETTINGS_PATH, PLAN_MODE_LEGACY_CONFIG_PATH } from "../../../src/shared/paths.js";
import { type PlanModeConfig, type ModeProfileConfig, normalizeThinkingLevel } from "../../../src/shared/types.js";

export type { PlanModeConfig, ModeProfileConfig };
export { normalizeThinkingLevel };

export function loadPlanModeConfig(): PlanModeConfig {
  const customConfig = readJsonObject(CUSTOM_CONFIG_PATH);
  const customPlanMode = customConfig?.planMode;
  if (customPlanMode && typeof customPlanMode === "object" && !Array.isArray(customPlanMode)) {
    return customPlanMode as PlanModeConfig;
  }

  const settings = readJsonObject(SETTINGS_PATH);
  const settingsConfig = settings?.planMode;
  if (settingsConfig && typeof settingsConfig === "object" && !Array.isArray(settingsConfig)) {
    return settingsConfig as PlanModeConfig;
  }

  const legacy = readJsonObject(PLAN_MODE_LEGACY_CONFIG_PATH);
  return (legacy as PlanModeConfig | undefined) ?? {};
}

export function resolveModeProfile(config: PlanModeConfig, mode: "plan" | "implement"): ModeProfileConfig | undefined {
  const defaults = config.defaults ?? {};
  const specific = config[mode] ?? {};

  const merged: ModeProfileConfig = {
    model: specific.model ?? defaults.model,
    thinkingLevel: specific.thinkingLevel ?? defaults.thinkingLevel,
  };

  if (!merged.model && !merged.thinkingLevel) return undefined;
  return merged;
}

export function currentModelRef(ctx: ExtensionContext): string | undefined {
  const model = ctx.model as { provider?: string; id?: string } | undefined;
  if (!model?.provider || !model.id) return undefined;
  return model.provider + "/" + model.id;
}

export function resolveModelRef(ctx: ExtensionContext, modelRef: string): unknown {
  const trimmed = modelRef.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes("/")) {
    const slash = trimmed.indexOf("/");
    const provider = trimmed.slice(0, slash).trim();
    const id = trimmed.slice(slash + 1).trim();
    if (!provider || !id) return undefined;
    return ctx.modelRegistry.find(provider, id);
  }

  const matches = ctx.modelRegistry.getAll().filter((model) => model.id === trimmed);

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    const provider = (ctx.model as { provider?: string } | undefined)?.provider;
    if (provider) {
      const sameProvider = matches.find((model) => model.provider === provider);
      if (sameProvider) return sameProvider;
    }
  }

  return undefined;
}

export async function applyModeProfile(pi: ExtensionAPI, ctx: ExtensionContext, mode: "plan" | "implement"): Promise<void> {
  const config = loadPlanModeConfig();
  const profile = resolveModeProfile(config, mode);
  if (!profile) return;

  if (profile.model) {
    const model = resolveModelRef(ctx, profile.model);
    if (!model) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Plan mode config (" + mode + ".model/defaults.model) not found: " + profile.model + ". Use provider/model-id when ambiguous.",
          "warning",
        );
      }
    } else {
      const changed = await pi.setModel(model as any);
      if (!changed && ctx.hasUI) {
        ctx.ui.notify("Could not switch to configured " + mode + " model: " + profile.model, "warning");
      }
    }
  }

  if (profile.thinkingLevel) {
    const normalized = normalizeThinkingLevel(profile.thinkingLevel);
    if (!normalized) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Plan mode config (" + mode + ".thinkingLevel/defaults.thinkingLevel) invalid: " + profile.thinkingLevel + ". Allowed: off, low, medium, high, xhigh.",
          "warning",
        );
      }
    } else {
      pi.setThinkingLevel(normalized as any);
    }
  }
}

export async function restorePrePlanProfile(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  modelBeforePlanRef: string | undefined,
  thinkingBeforePlan: string | undefined,
): Promise<void> {
  if (modelBeforePlanRef) {
    const model = resolveModelRef(ctx, modelBeforePlanRef);
    if (model) {
      await pi.setModel(model as any);
    }
  }

  const normalizedThinking = normalizeThinkingLevel(thinkingBeforePlan);
  if (normalizedThinking) {
    pi.setThinkingLevel(normalizedThinking as any);
  }
}
