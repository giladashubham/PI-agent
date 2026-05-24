import { readJsonObject } from "../../../src/shared/config.js";
import { CUSTOM_CONFIG_PATH, SETTINGS_PATH } from "../../../src/shared/paths.js";
import { normalizeThinkingLevel } from "../../../src/shared/types.js";
import { type AdvisorToolProfile, normalizeAdvisorToolProfile } from "./advisor-tool-policy.js";

export interface AdvisorTriggersConfig {
  architecture: boolean;
  migration: boolean;
  security: boolean;
  riskyRefactor: boolean;
}

export interface AdvisorModeConfig {
  enabled: boolean;
  advisorModel?: string;
  thinkingLevel: string;
  toolProfile: AdvisorToolProfile;
  timeoutMs: number;
  maxAdvisorCallsPerTurn: number;
  maxAdvisorCallsPerSession: number;
  maxFiles: number;
  maxFileBytes: number;
  maxDraftBytes: number;
  maxSnippetBytes: number;
  allowReadOnlyBash: boolean;
  autoSuggest: boolean;
  triggers: AdvisorTriggersConfig;
}

interface AdvisorModeRawConfig {
  enabled?: unknown;
  advisorModel?: unknown;
  thinkingLevel?: unknown;
  toolProfile?: unknown;
  timeoutMs?: unknown;
  maxAdvisorCallsPerTurn?: unknown;
  maxAdvisorCallsPerSession?: unknown;
  maxFiles?: unknown;
  maxFileBytes?: unknown;
  maxDraftBytes?: unknown;
  maxSnippetBytes?: unknown;
  allowReadOnlyBash?: unknown;
  autoSuggest?: unknown;
  triggers?: unknown;
}

const DEFAULT_TRIGGERS: AdvisorTriggersConfig = {
  architecture: true,
  migration: true,
  security: true,
  riskyRefactor: false,
};

export const DEFAULT_ADVISOR_MODE_CONFIG: AdvisorModeConfig = {
  enabled: false,
  advisorModel: undefined,
  thinkingLevel: "high",
  toolProfile: "research",
  timeoutMs: 60_000,
  maxAdvisorCallsPerTurn: 1,
  maxAdvisorCallsPerSession: 20,
  maxFiles: 3,
  maxFileBytes: 12_000,
  maxDraftBytes: 16_000,
  maxSnippetBytes: 8_000,
  allowReadOnlyBash: false,
  autoSuggest: true,
  triggers: DEFAULT_TRIGGERS,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value <= 0) return fallback;
  return Math.floor(value);
}

function normalizeTriggers(value: unknown): AdvisorTriggersConfig {
  if (!isObject(value)) return { ...DEFAULT_TRIGGERS };

  return {
    architecture: toBoolean(value.architecture, DEFAULT_TRIGGERS.architecture),
    migration: toBoolean(value.migration, DEFAULT_TRIGGERS.migration),
    security: toBoolean(value.security, DEFAULT_TRIGGERS.security),
    riskyRefactor: toBoolean(value.riskyRefactor, DEFAULT_TRIGGERS.riskyRefactor),
  };
}

function normalizeAdvisorModeConfig(raw: AdvisorModeRawConfig): AdvisorModeConfig {
  const thinkingLevel = normalizeThinkingLevel(toOptionalString(raw.thinkingLevel)) ?? DEFAULT_ADVISOR_MODE_CONFIG.thinkingLevel;
  const toolProfile =
    normalizeAdvisorToolProfile(toOptionalString(raw.toolProfile)) ?? DEFAULT_ADVISOR_MODE_CONFIG.toolProfile;

  return {
    enabled: toBoolean(raw.enabled, DEFAULT_ADVISOR_MODE_CONFIG.enabled),
    advisorModel: toOptionalString(raw.advisorModel),
    thinkingLevel,
    toolProfile,
    timeoutMs: toPositiveInt(raw.timeoutMs, DEFAULT_ADVISOR_MODE_CONFIG.timeoutMs),
    maxAdvisorCallsPerTurn: toPositiveInt(raw.maxAdvisorCallsPerTurn, DEFAULT_ADVISOR_MODE_CONFIG.maxAdvisorCallsPerTurn),
    maxAdvisorCallsPerSession: toPositiveInt(
      raw.maxAdvisorCallsPerSession,
      DEFAULT_ADVISOR_MODE_CONFIG.maxAdvisorCallsPerSession,
    ),
    maxFiles: toPositiveInt(raw.maxFiles, DEFAULT_ADVISOR_MODE_CONFIG.maxFiles),
    maxFileBytes: toPositiveInt(raw.maxFileBytes, DEFAULT_ADVISOR_MODE_CONFIG.maxFileBytes),
    maxDraftBytes: toPositiveInt(raw.maxDraftBytes, DEFAULT_ADVISOR_MODE_CONFIG.maxDraftBytes),
    maxSnippetBytes: toPositiveInt(raw.maxSnippetBytes, DEFAULT_ADVISOR_MODE_CONFIG.maxSnippetBytes),
    allowReadOnlyBash: toBoolean(raw.allowReadOnlyBash, DEFAULT_ADVISOR_MODE_CONFIG.allowReadOnlyBash),
    autoSuggest: toBoolean(raw.autoSuggest, DEFAULT_ADVISOR_MODE_CONFIG.autoSuggest),
    triggers: normalizeTriggers(raw.triggers),
  };
}

function readSection(value: unknown): AdvisorModeRawConfig | undefined {
  if (!isObject(value)) return undefined;
  return value as AdvisorModeRawConfig;
}

export function loadAdvisorModeConfig(): AdvisorModeConfig {
  const custom = readJsonObject(CUSTOM_CONFIG_PATH);
  const customConfig = readSection(custom?.advisorMode);
  if (customConfig) return normalizeAdvisorModeConfig(customConfig);

  const settings = readJsonObject(SETTINGS_PATH);
  const settingsConfig = readSection(settings?.advisorMode);
  if (settingsConfig) return normalizeAdvisorModeConfig(settingsConfig);

  return { ...DEFAULT_ADVISOR_MODE_CONFIG, triggers: { ...DEFAULT_TRIGGERS } };
}

export function validateAdvisorModeConfigForEnable(config: AdvisorModeConfig): string[] {
  const issues: string[] = [];

  if (!config.advisorModel) {
    issues.push("advisorMode.advisorModel is required");
  }

  if (!normalizeThinkingLevel(config.thinkingLevel)) {
    issues.push("advisorMode.thinkingLevel must be one of: off, low, medium, high, xhigh");
  }

  if (!normalizeAdvisorToolProfile(config.toolProfile)) {
    issues.push("advisorMode.toolProfile must be one of: strict, research");
  }

  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    issues.push("advisorMode.timeoutMs must be a positive number");
  }

  return issues;
}

export { normalizeAdvisorModeConfig };
