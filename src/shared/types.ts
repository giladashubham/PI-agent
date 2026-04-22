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
