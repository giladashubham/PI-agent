import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { DynamicProviderModel } from "./shared/provider-types.js";
import { patchModelRegistryForProvider } from "./shared/registry-patch.js";
import { isApiKeyConfigured, stripProviderModelsFromRegistry, getProviderModels } from "./shared/provider-utils.js";

const OPENCODE_GO_PROVIDER = "opencode-go";
const STATUS_KEY = "opencode-go-models";
const API_KEY_NAMES = ["OPENCODE_GO_API_KEY", "opencode_go_API_KEY"] as const;

export function isOpencodeGoApiKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isApiKeyConfigured(API_KEY_NAMES, env);
}

export function stripOpencodeGoModelsFromRegistry(registry: { models?: Array<{ provider?: string }> }): void {
  stripProviderModelsFromRegistry(registry, OPENCODE_GO_PROVIDER);
}

function getOpencodeGoModels(ctx: ExtensionContext): DynamicProviderModel[] {
  return getProviderModels(ctx, OPENCODE_GO_PROVIDER);
}

async function syncOpencodeGoModels(pi: ExtensionAPI, ctx: ExtensionContext) {
  patchModelRegistryForProvider(ctx, OPENCODE_GO_PROVIDER, "__opencodeGoModelsPatched", () => isOpencodeGoApiKeyConfigured());

  if (!isOpencodeGoApiKeyConfigured()) {
    stripOpencodeGoModelsFromRegistry(ctx.modelRegistry as any);
    ctx.ui.setStatus(STATUS_KEY, "opencode-go: disabled (no GO API key)");
    return;
  }

  const models = getOpencodeGoModels(ctx);
  if (models.length === 0) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }

  pi.registerProvider(OPENCODE_GO_PROVIDER, {
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKey: "OPENCODE_GO_API_KEY",
    models: models as any,
  });

  ctx.ui.setStatus(STATUS_KEY, "opencode-go: " + models.length + " models");
}

export default function opencodeGoModels(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    await syncOpencodeGoModels(pi, ctx);
  });
}
