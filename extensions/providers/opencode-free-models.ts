import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const OPENCODE_PROVIDER = "opencode";
const STATUS_KEY = "opencode-free-models";

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

let allowedFreeModelIds = new Set<string>();

function isFreeCost(cost: Cost | undefined): boolean {
  if (!cost) return false;
  return cost.input === 0 && cost.output === 0 && cost.cacheRead === 0 && cost.cacheWrite === 0;
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

function patchModelRegistryForModelBaseUrls(ctx: ExtensionContext) {
  const registry = ctx.modelRegistry as any;
  if (registry.__opencodeFreeModelsPatched) return;

  const originalApplyProviderConfig = registry.applyProviderConfig?.bind(registry);
  if (typeof originalApplyProviderConfig !== "function") return;

  registry.applyProviderConfig = function applyProviderConfigPatched(providerName: string, config: any) {
    if (providerName !== OPENCODE_PROVIDER || !config?.models?.length || config.oauth || config.streamSimple) {
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

  registry.__opencodeFreeModelsPatched = true;
}

function getFreeOpencodeModels(ctx: ExtensionContext): DynamicProviderModel[] {
  return ctx.modelRegistry
    .getAll()
    .filter((model) => model.provider === OPENCODE_PROVIDER)
    .filter((model) => isFreeCost(model.cost))
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

async function enforceFreeOpencodeOnly(pi: ExtensionAPI, ctx: ExtensionContext) {
  patchModelRegistryForModelBaseUrls(ctx);

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

  ctx.ui.setStatus(STATUS_KEY, `opencode: ${freeModels.length} free models`);

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
      `Switched to ${OPENCODE_PROVIDER}/${fallbackModel.id} because paid opencode models are hidden.`,
      "info",
    );
  }
}

export default function opencodeFreeModels(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    await enforceFreeOpencodeOnly(pi, ctx);
  });

  pi.on("model_select", async (event, ctx) => {
    if (event.model.provider !== OPENCODE_PROVIDER) return;
    if (allowedFreeModelIds.has(event.model.id)) return;

    const fallbackId = getPreferredFallbackId(Array.from(allowedFreeModelIds));
    if (!fallbackId) return;

    const fallbackModel = ctx.modelRegistry.find(OPENCODE_PROVIDER, fallbackId);
    if (!fallbackModel) return;

    const changed = await pi.setModel(fallbackModel);
    if (changed) {
      ctx.ui.notify(
        `${OPENCODE_PROVIDER}/${event.model.id} is hidden. Using ${OPENCODE_PROVIDER}/${fallbackModel.id} instead.`,
        "warning",
      );
    }
  });
}
