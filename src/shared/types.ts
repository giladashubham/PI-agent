/**
 * Model cost information (used by provider extensions).
 */
export interface Cost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Dynamic provider model definition (used by provider extensions).
 */
export interface DynamicProviderModel {
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
}

/**
 * Mode profile configuration (used by plan mode).
 */
export interface ModeProfileConfig {
  model?: string;
  thinkingLevel?: string;
}

/**
 * Plan mode configuration.
 */
export interface PlanModeConfig {
  defaults?: ModeProfileConfig;
  plan?: ModeProfileConfig;
  implement?: ModeProfileConfig;
}

/**
 * Valid thinking levels.
 */
export const VALID_THINKING_LEVELS = new Set(["off", "low", "medium", "high", "xhigh"]);

/**
 * Normalize and validate a thinking level string.
 */
export function normalizeThinkingLevel(level: string | undefined): string | undefined {
  if (!level) return undefined;
  const normalized = level.trim().toLowerCase();
  return VALID_THINKING_LEVELS.has(normalized) ? normalized : undefined;
}
