const DEFAULT_SUBAGENT_MODEL = "openai-codex/gpt-5.4-mini";

export interface SubAgentModelConfig {
  model?: string;
}

function normalizeModelRef(modelRef: string | undefined): string | undefined {
  if (!modelRef) return undefined;
  const trimmed = modelRef.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveSubAgentModel(config: SubAgentModelConfig): { model: string } {
  return {
    model: normalizeModelRef(config.model) || DEFAULT_SUBAGENT_MODEL,
  };
}
