import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readJsonObject, writeJsonConfig } from "../../../src/shared/config.js";
import { CUSTOM_CONFIG_PATH } from "../../../src/shared/paths.js";
import { type AdvisorModeConfig, loadAdvisorModeConfig, validateAdvisorModeConfigForEnable } from "./advisor-config.js";
import { buildAdvisorRolePrompt, buildPrimaryAdvisorModePrompt } from "./advisor-prompts.js";
import { buildAdvisorContext, type ConsultAdvisorInput } from "./advisor-context.js";
import { runAdvisorSubagent } from "./advisor-subagent.js";

interface AdvisorModeState {
  enabled: boolean;
  advisorCallsThisSession: number;
  advisorModelOverride?: string;
}

interface ModelSummary {
  provider?: string;
  id?: string;
  name?: string;
}

const ADVISOR_STATE_ENTRY = "advisor-mode-state";
const ADVISOR_STATUS_KEY = "advisor-mode";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function modelToRef(model: ModelSummary | undefined): string | undefined {
  if (!model?.provider || !model.id) return undefined;
  return `${model.provider}/${model.id}`;
}

function resolveModelRef(ctx: ExtensionContext, modelRef: string): string | undefined {
  const trimmed = modelRef.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes("/")) {
    const slashIndex = trimmed.indexOf("/");
    const provider = trimmed.slice(0, slashIndex).trim();
    const id = trimmed.slice(slashIndex + 1).trim();
    if (!provider || !id) return undefined;

    const model = ctx.modelRegistry.find(provider, id) as ModelSummary | undefined;
    return modelToRef(model);
  }

  const allModels = ctx.modelRegistry.getAll() as ModelSummary[];
  const matches = allModels.filter((model) => model.id === trimmed);
  if (matches.length === 1) {
    return modelToRef(matches[0]);
  }

  if (matches.length > 1) {
    const currentProvider = (ctx.model as ModelSummary | undefined)?.provider;
    if (currentProvider) {
      const providerMatch = matches.find((model) => model.provider === currentProvider);
      if (providerMatch) {
        return modelToRef(providerMatch);
      }
    }
  }

  return undefined;
}

function listSelectableModels(ctx: ExtensionContext): Array<{ ref: string; label: string }> {
  const allModels = ctx.modelRegistry.getAll() as ModelSummary[];

  const result = allModels
    .map((model) => {
      const ref = modelToRef(model);
      if (!ref) return undefined;
      const name = model.name?.trim() || model.id || "unknown";
      return {
        ref,
        label: `${ref} — ${name}`,
      };
    })
    .filter((entry): entry is { ref: string; label: string } => Boolean(entry));

  result.sort((a, b) => a.label.localeCompare(b.label));
  return result;
}

function setAdvisorStatus(ctx: ExtensionContext, enabled: boolean): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(ADVISOR_STATUS_KEY, enabled ? "advisor" : undefined);
}

function persistState(pi: ExtensionAPI, state: AdvisorModeState): void {
  pi.appendEntry(ADVISOR_STATE_ENTRY, state);
}

function restoreState(ctx: ExtensionContext): AdvisorModeState | undefined {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i] as { type?: string; customType?: string; data?: AdvisorModeState };
    if (entry.type === "custom" && entry.customType === ADVISOR_STATE_ENTRY) {
      return entry.data;
    }
  }
  return undefined;
}

function formatValidationIssues(issues: string[]): string {
  if (issues.length === 0) return "";
  return issues.map((issue) => `- ${issue}`).join("\n");
}

function persistAdvisorModelToCustomConfig(modelRef: string): void {
  const config = readJsonObject(CUSTOM_CONFIG_PATH) ?? {};
  const advisorMode = isObject(config.advisorMode) ? { ...config.advisorMode } : {};

  advisorMode.advisorModel = modelRef;

  writeJsonConfig(CUSTOM_CONFIG_PATH, {
    ...config,
    advisorMode,
  });
}

export default function advisorModeExtension(pi: ExtensionAPI): void {
  if (process.env.PI_ADVISOR_SUBAGENT === "1") {
    return;
  }

  let enabled = false;
  let advisorCallsThisTurn = 0;
  let advisorCallsThisSession = 0;
  let advisorModelOverride: string | undefined;

  const getEffectiveConfig = (): AdvisorModeConfig => {
    const config = loadAdvisorModeConfig();
    if (!advisorModelOverride) return config;
    return { ...config, advisorModel: advisorModelOverride };
  };

  const persistCurrentState = () => {
    persistState(pi, { enabled, advisorCallsThisSession, advisorModelOverride });
  };

  const canEnableWithCurrentConfig = (ctx: ExtensionContext): boolean => {
    const config = getEffectiveConfig();
    const issues = validateAdvisorModeConfigForEnable(config);
    if (issues.length > 0) {
      if (ctx.hasUI) {
        ctx.ui.notify("Advisor mode config invalid:\n" + formatValidationIssues(issues), "warning");
      }
      return false;
    }
    return true;
  };

  const setAdvisorModel = async (modelRef: string, ctx: ExtensionContext): Promise<boolean> => {
    const resolvedModelRef = resolveModelRef(ctx, modelRef);
    if (!resolvedModelRef) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Advisor model not found: ${modelRef}`, "warning");
      }
      return false;
    }

    advisorModelOverride = resolvedModelRef;
    persistAdvisorModelToCustomConfig(resolvedModelRef);
    persistCurrentState();

    if (ctx.hasUI) {
      ctx.ui.notify(`Advisor model set to ${resolvedModelRef}`, "info");
    }
    return true;
  };

  const openAdvisorModelSelector = async (ctx: ExtensionCommandContext): Promise<void> => {
    if (!ctx.hasUI) {
      return;
    }

    const models = listSelectableModels(ctx);
    if (models.length === 0) {
      ctx.ui.notify("No models available to select as advisor.", "warning");
      return;
    }

    const currentModelRef = advisorModelOverride ?? loadAdvisorModeConfig().advisorModel;
    const options = models.map((model) => {
      const prefix = model.ref === currentModelRef ? "✓ " : "  ";
      return `${prefix}${model.label}`;
    });

    const selection = await ctx.ui.select("Select advisor model", options);
    if (!selection) return;

    const normalizedSelection = selection.replace(/^\s*✓?\s*/, "");
    const selectedModel = models.find((model) => model.label === normalizedSelection);
    if (!selectedModel) return;

    await setAdvisorModel(selectedModel.ref, ctx);
  };

  const handleAdvisorModelCommand = async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    const value = (args || "").trim();

    if (!value) {
      await openAdvisorModelSelector(ctx);
      return;
    }

    if (value === "show" || value === "current") {
      const current = advisorModelOverride ?? loadAdvisorModeConfig().advisorModel;
      if (ctx.hasUI) {
        ctx.ui.notify(`Current advisor model: ${current ?? "(not configured)"}`, "info");
      }
      return;
    }

    await setAdvisorModel(value, ctx);
  };

  const enableAdvisorMode = async (ctx: ExtensionContext): Promise<boolean> => {
    if (enabled) {
      setAdvisorStatus(ctx, true);
      return true;
    }

    if (!canEnableWithCurrentConfig(ctx)) {
      return false;
    }

    enabled = true;
    setAdvisorStatus(ctx, true);
    if (ctx.hasUI) {
      ctx.ui.notify("Advisor mode enabled.", "info");
    }
    persistCurrentState();
    return true;
  };

  const disableAdvisorMode = async (ctx: ExtensionContext): Promise<void> => {
    if (!enabled) {
      setAdvisorStatus(ctx, false);
      return;
    }

    enabled = false;
    setAdvisorStatus(ctx, false);
    if (ctx.hasUI) {
      ctx.ui.notify("Advisor mode disabled.", "info");
    }
    persistCurrentState();
  };

  const advisorCommand = async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    const raw = (args || "").trim();

    if (!raw || raw === "toggle") {
      if (enabled) await disableAdvisorMode(ctx);
      else await enableAdvisorMode(ctx);
      return;
    }

    const [firstWord, ...restWords] = raw.split(/\s+/);
    if (firstWord === "model") {
      await handleAdvisorModelCommand(restWords.join(" "), ctx);
      return;
    }

    if (raw === "on" || raw === "enable") {
      await enableAdvisorMode(ctx);
      return;
    }

    if (raw === "off" || raw === "disable") {
      await disableAdvisorMode(ctx);
      return;
    }

    if (!enabled) {
      const activated = await enableAdvisorMode(ctx);
      if (!activated) return;
    }

    pi.sendUserMessage(raw);
  };

  pi.registerCommand("advisor", {
    description:
      "Advisor mode toggle. Usage: /advisor, /advisor on, /advisor off, /advisor model [provider/model-id], /advisor <task>",
    handler: async (args, ctx) => advisorCommand(args, ctx),
  });

  pi.registerTool({
    name: "consult_advisor",
    label: "Consult Advisor",
    description:
      "Consult a larger advisor model for high-value review of architecture, correctness, risk, migrations, or security decisions.",
    promptSnippet: "Consult a larger advisor model for high-value reasoning checks.",
    promptGuidelines: [
      "Use consult_advisor sparingly and only for high-value decisions.",
      "Provide objective, draft, and concerns so the advisor can give actionable feedback.",
      "Do not use consult_advisor for trivial edits or routine lookups.",
    ],
    parameters: Type.Object({
      objective: Type.String({ description: "What decision or problem should the advisor evaluate." }),
      draft: Type.Optional(Type.String({ description: "Current plan, approach, or draft answer from the primary model." })),
      concerns: Type.Optional(Type.String({ description: "Specific risks, doubts, or failure modes to evaluate." })),
      outputFormat: Type.Optional(Type.String({ description: "Preferred output structure (e.g., checklist, bullets, concise)." })),
      relevantFiles: Type.Optional(
        Type.Array(
          Type.Object({
            path: Type.String({ description: "File path hint." }),
            reason: Type.Optional(Type.String({ description: "Why this file matters." })),
            content: Type.Optional(Type.String({ description: "Optional file content snippet or excerpt." })),
          }),
          { maxItems: 10, description: "Optional relevant file hints." },
        ),
      ),
      snippets: Type.Optional(
        Type.Array(
          Type.Object({
            label: Type.Optional(Type.String({ description: "Snippet label." })),
            content: Type.String({ description: "Snippet content." }),
          }),
          { maxItems: 10, description: "Additional snippets for advisor review." },
        ),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!enabled) {
        return {
          content: [{ type: "text", text: "Advisor mode is off. Run /advisor on before using consult_advisor." }],
          details: { status: "blocked", reason: "mode-off" },
          isError: true,
        };
      }

      const config = getEffectiveConfig();
      const issues = validateAdvisorModeConfigForEnable(config);
      if (issues.length > 0) {
        return {
          content: [{ type: "text", text: "Advisor mode config invalid:\n" + formatValidationIssues(issues) }],
          details: { status: "blocked", reason: "invalid-config", issues },
          isError: true,
        };
      }

      if (advisorCallsThisTurn >= config.maxAdvisorCallsPerTurn) {
        return {
          content: [{ type: "text", text: "Advisor call skipped: maxAdvisorCallsPerTurn limit reached for this turn." }],
          details: { status: "blocked", reason: "turn-budget" },
        };
      }

      if (advisorCallsThisSession >= config.maxAdvisorCallsPerSession) {
        return {
          content: [{ type: "text", text: "Advisor call skipped: maxAdvisorCallsPerSession limit reached for this session." }],
          details: { status: "blocked", reason: "session-budget" },
        };
      }

      advisorCallsThisTurn += 1;
      advisorCallsThisSession += 1;
      persistCurrentState();

      const contextResult = buildAdvisorContext(params as ConsultAdvisorInput, config);
      const fullPrompt = [buildAdvisorRolePrompt(config), "", contextResult.prompt].join("\n");

      const advisorResult = await runAdvisorSubagent({
        cwd: ctx.cwd,
        prompt: fullPrompt,
        advisorModel: config.advisorModel!,
        thinkingLevel: config.thinkingLevel,
        toolProfile: config.toolProfile,
        allowReadOnlyBash: config.allowReadOnlyBash,
        timeoutMs: config.timeoutMs,
        signal,
      });

      if (!advisorResult.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Advisor request failed: ${advisorResult.error}\nProceeding without advisor guidance.`,
            },
          ],
          details: { status: "failed", error: advisorResult.error },
        };
      }

      return {
        content: [{ type: "text", text: advisorResult.response }],
        details: { status: "ok", truncatedContext: contextResult.truncated },
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    advisorCallsThisTurn = 0;

    const restored = restoreState(ctx);
    if (restored) {
      enabled = restored.enabled;
      advisorCallsThisSession = Math.max(0, restored.advisorCallsThisSession || 0);
      advisorModelOverride = restored.advisorModelOverride;
    } else {
      const config = loadAdvisorModeConfig();
      enabled = config.enabled;
      advisorCallsThisSession = 0;
      advisorModelOverride = undefined;
    }

    if (enabled && !canEnableWithCurrentConfig(ctx)) {
      enabled = false;
    }

    setAdvisorStatus(ctx, enabled);
  });

  pi.on("turn_start", async () => {
    advisorCallsThisTurn = 0;
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return {};
    const config = getEffectiveConfig();
    return { systemPrompt: (event.systemPrompt || "") + buildPrimaryAdvisorModePrompt(config) };
  });
}
