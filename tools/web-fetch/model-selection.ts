const OPENCODE_PROVIDER = "opencode";
const PREFERRED_OPENCODE_FREE_MODELS = [
  "qwen3.6-plus-free",
  "nemotron-3-super-free",
  "minimax-m2.5-free",
  "big-pickle",
  "gpt-5-nano",
] as const;

type ModelCost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

type RegistryModel = {
  provider: string;
  id: string;
  cost?: ModelCost;
};

export interface SubAgentModelConfig {
  model?: string;
  opencodeFreeOnly?: boolean;
  opencodePreferredFreeModelId?: string;
}

function isFreeCost(cost: ModelCost | undefined): boolean {
  if (!cost) return false;
  return cost.input === 0 && cost.output === 0 && cost.cacheRead === 0 && cost.cacheWrite === 0;
}

function getFreeOpencodeModelIds(modelRegistry: { getAll: () => RegistryModel[] }): string[] {
  return modelRegistry
    .getAll()
    .filter((model) => model.provider === OPENCODE_PROVIDER)
    .filter((model) => isFreeCost(model.cost))
    .map((model) => model.id);
}

function pickFreeOpencodeModelId(ids: string[], preferredId?: string): string | undefined {
  if (preferredId && ids.includes(preferredId)) return preferredId;
  for (const id of PREFERRED_OPENCODE_FREE_MODELS) {
    if (ids.includes(id)) return id;
  }
  return ids[0];
}

function parseModelRef(modelRef: string): { provider: string; id: string } | null {
  const slash = modelRef.indexOf("/");
  if (slash <= 0 || slash === modelRef.length - 1) return null;
  return {
    provider: modelRef.slice(0, slash),
    id: modelRef.slice(slash + 1),
  };
}

export function resolveSubAgentModel(
  ctx: { model?: { provider: string; id: string }; modelRegistry: { getAll: () => RegistryModel[] } },
  config: SubAgentModelConfig,
): { model?: string; error?: string } {
  const opencodeFreeOnly = config.opencodeFreeOnly !== false;

  if (!opencodeFreeOnly) {
    return { model: config.model || (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined) };
  }

  const freeOpencodeModelIds = getFreeOpencodeModelIds(ctx.modelRegistry);
  if (freeOpencodeModelIds.length === 0) {
    return {
      error: "web_fetch is configured to use only free opencode models, but none are available.",
    };
  }

  const configured = config.model ? parseModelRef(config.model) : null;
  if (configured?.provider === OPENCODE_PROVIDER && freeOpencodeModelIds.includes(configured.id)) {
    return { model: `${OPENCODE_PROVIDER}/${configured.id}` };
  }

  if (ctx.model?.provider === OPENCODE_PROVIDER && freeOpencodeModelIds.includes(ctx.model.id)) {
    return { model: `${OPENCODE_PROVIDER}/${ctx.model.id}` };
  }

  const preferredId = pickFreeOpencodeModelId(
    freeOpencodeModelIds,
    config.opencodePreferredFreeModelId || configured?.id,
  );
  if (!preferredId) {
    return {
      error: "web_fetch could not select a free opencode model.",
    };
  }

  return { model: `${OPENCODE_PROVIDER}/${preferredId}` };
}
