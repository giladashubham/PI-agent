import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Cost, DynamicProviderModel } from "./provider-types.js";

export function isApiKeyConfigured(envKeys: readonly string[], env: NodeJS.ProcessEnv = process.env): boolean {
  for (const keyName of envKeys) {
    const value = env[keyName];
    if (typeof value === "string" && value.trim().length > 0) return true;
  }
  return false;
}

export function stripProviderModelsFromRegistry(registry: { models?: Array<{ provider?: string }> }, providerName: string): void {
  if (!Array.isArray(registry.models)) return;
  registry.models = registry.models.filter((model) => model.provider !== providerName);
}

export function isFreeCost(cost: Cost | undefined): boolean {
  if (!cost) return false;
  return cost.input === 0 && cost.output === 0 && cost.cacheRead === 0 && cost.cacheWrite === 0;
}

export function getProviderModels(ctx: ExtensionContext, providerName: string): DynamicProviderModel[] {
  return ctx.modelRegistry
    .getAll()
    .filter((model) => model.provider === providerName)
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
