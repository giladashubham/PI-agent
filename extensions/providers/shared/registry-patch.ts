import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Generic registry patch for providers that need per-model baseUrl support.
 * The patchKey is used to track whether the patch has already been applied.
 */
export function patchModelRegistryForProvider(
  ctx: ExtensionContext,
  providerName: string,
  patchKey: string,
  isApiKeyConfigured: () => boolean,
): void {
  const registry = ctx.modelRegistry as any;
  if (registry[patchKey]) return;

  const originalApplyProviderConfig = registry.applyProviderConfig?.bind(registry);
  if (typeof originalApplyProviderConfig !== "function") return;

  registry.applyProviderConfig = function applyProviderConfigPatched(name: string, config: any) {
    if (name !== providerName) {
      return originalApplyProviderConfig(name, config);
    }

    if (!isApiKeyConfigured()) {
      registry.models = registry.models.filter((model: any) => model.provider !== name);
      return;
    }

    if (!config?.models?.length || config.oauth || config.streamSimple) {
      return originalApplyProviderConfig(name, config);
    }

    registry.storeProviderRequestConfig(name, config);
    registry.models = registry.models.filter((model: any) => model.provider !== name);

    for (const modelDef of config.models) {
      const api = modelDef.api || config.api;
      registry.storeModelHeaders(name, modelDef.id, modelDef.headers);
      registry.models.push({
        id: modelDef.id,
        name: modelDef.name,
        api,
        provider: name,
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

  registry[patchKey] = true;
}
