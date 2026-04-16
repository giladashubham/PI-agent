import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const OPENCODE_GO_PROVIDER = "opencode-go";
const STATUS_KEY = "opencode-go-models";
const OPENCODE_GO_ENV_KEYS = ["OPENCODE_GO_API_KEY", "opencode_go_API_KEY"] as const;

type Cost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

type DynamicProviderModel = {
  id: string;
  name: string;
  api?: string;
  baseUrl?: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: Cost;
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: unknown;
};

export function isOpencodeGoApiKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  for (const keyName of OPENCODE_GO_ENV_KEYS) {
    const value = env[keyName];
    if (typeof value === "string" && value.trim().length > 0) return true;
  }
  return false;
}

export function stripOpencodeGoModelsFromRegistry(registry: { models?: Array<{ provider?: string }> }): void {
  if (!Array.isArray(registry.models)) return;
  registry.models = registry.models.filter((model) => model.provider !== OPENCODE_GO_PROVIDER);
}

function patchModelRegistryForGoModelBaseUrls(ctx: ExtensionContext) {
  const registry = ctx.modelRegistry as any;
  if (registry.__opencodeGoModelsPatched) return;

  const originalApplyProviderConfig = registry.applyProviderConfig?.bind(registry);
  if (typeof originalApplyProviderConfig !== "function") return;

  registry.applyProviderConfig = function applyProviderConfigPatched(providerName: string, config: any) {
    if (providerName !== OPENCODE_GO_PROVIDER) {
      return originalApplyProviderConfig(providerName, config);
    }

    if (!isOpencodeGoApiKeyConfigured()) {
      registry.models = registry.models.filter((model: any) => model.provider !== providerName);
      return;
    }

    if (!config?.models?.length || config.oauth || config.streamSimple) {
      return originalApplyProviderConfig(providerName, config);
    }

    registry.storeProviderRequestConfig(providerName, config);
    registry.models = registry.models.filter((model: any) => model.provider !== providerName);

    for (const modelDef of config.models) {
      const api = modelDef.api || config.api;
      registry.storeModelHeaders(providerName, modelDef.id, modelDef.headers);
      registry.models.push({
        id: modelDef.id,
        name: modelDef.name,
        api,
        provider: providerName,
        baseUrl: modelDef.baseUrl ?? config.baseUrl,
        reasoning: modelDef.reasoning,
        input: modelDef.input,
        cost: modelDef.cost,
        contextWindow: modelDef.contextWindow,
        maxTokens: modelDef.maxTokens,
        headers: undefined,
        compat: modelDef.compat,
      });
    }
  };

  registry.__opencodeGoModelsPatched = true;
}

function getOpencodeGoModels(ctx: ExtensionContext): DynamicProviderModel[] {
  return ctx.modelRegistry
    .getAll()
    .filter((model) => model.provider === OPENCODE_GO_PROVIDER)
    .map((model) => ({
      id: model.id,
      name: model.name,
      api: model.api,
      baseUrl: model.baseUrl,
      reasoning: model.reasoning,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      compat: model.compat,
    }));
}

async function syncOpencodeGoModels(pi: ExtensionAPI, ctx: ExtensionContext) {
  patchModelRegistryForGoModelBaseUrls(ctx);

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

  ctx.ui.setStatus(STATUS_KEY, `opencode-go: ${models.length} models`);
}

export default function opencodeGoModels(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    await syncOpencodeGoModels(pi, ctx);
  });
}
