import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Cost, DynamicProviderModel } from "./shared/provider-types.js";
import { patchModelRegistryForProvider } from "./shared/registry-patch.js";
import { isApiKeyConfigured, stripProviderModelsFromRegistry, isFreeCost, getProviderModels } from "./shared/provider-utils.js";

const OPENCODE_PROVIDER = "opencode";
const STATUS_KEY = "opencode-free-models";
const API_KEY_NAMES = ["OPENCODE_API_KEY", "opencode_API_KEY"] as const;

let allowedFreeModelIds = new Set<string>();

export function isOpencodeApiKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isApiKeyConfigured(API_KEY_NAMES, env);
}

export function stripOpencodeModelsFromRegistry(registry: { models?: Array<{ provider?: string }> }): void {
  stripProviderModelsFromRegistry(registry, OPENCODE_PROVIDER);
}

function getPreferredFallbackId(ids: string[]): string | undefined {
  const preferredOrder = [
    "qwen3.6-plus-free",
    "gpt-5-nano",
    "nemotron-3-super-free",
    "minimax-m2.5-free",
    "big-pickle",
  ];

  for (const id of preferredOrder) {
    if (ids.includes(id)) return id;
  }
  return ids[0];
}

function getFreeOpencodeModels(ctx: ExtensionContext): DynamicProviderModel[] {
  return getProviderModels(ctx, OPENCODE_PROVIDER).filter((model) => isFreeCost(model.cost));
}

async function enforceFreeOpencodeOnly(pi: ExtensionAPI, ctx: ExtensionContext) {
  allowedFreeModelIds = new Set<string>();

  patchModelRegistryForProvider(ctx, OPENCODE_PROVIDER, "__opencodeFreeModelsPatched", () => isOpencodeApiKeyConfigured());

  if (!isOpencodeApiKeyConfigured()) {
    stripOpencodeModelsFromRegistry(ctx.modelRegistry as any);
    ctx.ui.setStatus(STATUS_KEY, "opencode: disabled (no API key)");
    return;
  }

  const freeModels = getFreeOpencodeModels(ctx);
  allowedFreeModelIds = new Set(freeModels.map((model) => model.id));

  if (freeModels.length === 0) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }

  pi.registerProvider(OPENCODE_PROVIDER, {
    baseUrl: "https://opencode.ai/zen",
    apiKey: "OPENCODE_API_KEY",
    models: freeModels as any,
  });

  ctx.ui.setStatus(STATUS_KEY, "opencode: " + freeModels.length + " free models");

  const currentModel = ctx.model;
  if (currentModel?.provider !== OPENCODE_PROVIDER || allowedFreeModelIds.has(currentModel.id)) {
    return;
  }

  const fallbackId = getPreferredFallbackId(freeModels.map((model) => model.id));
  if (!fallbackId) return;

  const fallbackModel = ctx.modelRegistry.find(OPENCODE_PROVIDER, fallbackId);
  if (!fallbackModel) return;

  const changed = await pi.setModel(fallbackModel);
  if (changed) {
    ctx.ui.notify(
      "Switched to " + OPENCODE_PROVIDER + "/" + fallbackModel.id + " because paid opencode models are hidden.",
      "info",
    );
  }
}

export default function opencodeFreeModels(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    await enforceFreeOpencodeOnly(pi, ctx);
  });

  pi.on("model_select", async (event, ctx) => {
    if (!isOpencodeApiKeyConfigured()) return;
    if (event.model.provider !== OPENCODE_PROVIDER) return;
    if (allowedFreeModelIds.has(event.model.id)) return;

    const fallbackId = getPreferredFallbackId(Array.from(allowedFreeModelIds));
    if (!fallbackId) return;

    const fallbackModel = ctx.modelRegistry.find(OPENCODE_PROVIDER, fallbackId);
    if (!fallbackModel) return;

    const changed = await pi.setModel(fallbackModel);
    if (changed) {
      ctx.ui.notify(
        OPENCODE_PROVIDER + "/" + event.model.id + " is hidden. Using " + OPENCODE_PROVIDER + "/" + fallbackModel.id + " instead.",
        "warning",
      );
    }
  });
}
