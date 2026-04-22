import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isSafePlanCommand } from "./bash-safety.js";
import { registerAskQuestionsTool } from "./ask-questions-tool.js";
import { PLAN_MODE_PROMPT } from "./plan-prompts.js";
import { getNormalModeToolNames, getPlanModeToolNames } from "./tool-sets.js";
import { currentModelRef, applyModeProfile, restorePrePlanProfile } from "./plan-config.js";

interface PlanModeState {
  enabled: boolean;
  previousTools?: string[];
  modelBeforePlanRef?: string;
  thinkingBeforePlan?: string;
}

const PLAN_STATE_ENTRY = "question-first-plan-mode";

function setPlanStatus(ctx: ExtensionContext, enabled: boolean): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("question-first-plan-mode", enabled ? "plan" : undefined);
}

function persistState(pi: ExtensionAPI, state: PlanModeState): void {
  pi.appendEntry(PLAN_STATE_ENTRY, state);
}

function restoreState(ctx: ExtensionContext): PlanModeState | undefined {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i] as { type?: string; customType?: string; data?: PlanModeState };
    if (entry.type === "custom" && entry.customType === PLAN_STATE_ENTRY) {
      return entry.data;
    }
  }
  return undefined;
}

function getPlanModeTools(pi: ExtensionAPI, previousTools: string[]): string[] {
  return getPlanModeToolNames(
    pi.getAllTools().map((tool) => tool.name),
    previousTools,
  );
}

function getNormalModeTools(pi: ExtensionAPI, currentTools: string[]): string[] {
  const available = new Set(pi.getAllTools().map((tool) => tool.name));
  return getNormalModeToolNames(currentTools).filter((name) => available.has(name));
}

function sameToolOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export default function questionFirstPlanMode(pi: ExtensionAPI): void {
  // Runtime state (persisted in session entries via PLAN_STATE_ENTRY)
  let enabled = false;
  let previousTools: string[] = [];
  let modelBeforePlanRef: string | undefined;
  let thinkingBeforePlan: string | undefined;

  // Always-available clarification tool
  registerAskQuestionsTool(pi);

  function persistCurrentState(): void {
    persistState(pi, { enabled, previousTools, modelBeforePlanRef, thinkingBeforePlan });
  }

  function syncToolsForCurrentMode(): void {
    const active = pi.getActiveTools();

    if (enabled) {
      const baseTools = previousTools.length > 0 ? previousTools : getNormalModeTools(pi, active);
      const expected = getPlanModeTools(pi, baseTools);
      if (!sameToolOrder(active, expected)) {
        previousTools = getNormalModeTools(pi, baseTools);
        pi.setActiveTools(expected);
      }
      return;
    }

    const expected = getNormalModeTools(pi, active);
    if (!sameToolOrder(active, expected)) {
      pi.setActiveTools(expected);
    }
  }

  async function enablePlanMode(ctx: ExtensionContext): Promise<void> {
    if (enabled) {
      setPlanStatus(ctx, true);
      return;
    }

    modelBeforePlanRef = currentModelRef(ctx);
    thinkingBeforePlan = pi.getThinkingLevel?.();
    previousTools = getNormalModeTools(pi, pi.getActiveTools());

    pi.setActiveTools(getPlanModeTools(pi, previousTools));
    enabled = true;

    await applyModeProfile(pi, ctx, "plan");
    setPlanStatus(ctx, true);
    if (ctx.hasUI) ctx.ui.notify("Plan mode enabled: read-only planning tools active.", "info");
    persistCurrentState();
  }

  async function disablePlanMode(ctx: ExtensionContext, options?: { restoreModelProfile?: boolean }): Promise<void> {
    if (!enabled) {
      setPlanStatus(ctx, false);
      return;
    }

    const restoreTools = previousTools.length > 0
      ? previousTools
      : getNormalModeTools(pi, pi.getAllTools().map((tool) => tool.name));

    pi.setActiveTools(restoreTools);
    enabled = false;
    setPlanStatus(ctx, false);

    if (ctx.hasUI) ctx.ui.notify("Plan mode disabled.", "info");

    if (options?.restoreModelProfile !== false) {
      await restorePrePlanProfile(pi, ctx, modelBeforePlanRef, thinkingBeforePlan);
    }

    modelBeforePlanRef = undefined;
    thinkingBeforePlan = undefined;
    persistCurrentState();
  }

  async function planCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const raw = (args || "").trim();

    if (!raw) {
      if (enabled) await disablePlanMode(ctx);
      else await enablePlanMode(ctx);
      return;
    }

    if (raw === "on" || raw === "enable") {
      await enablePlanMode(ctx);
      return;
    }

    if (raw === "off" || raw === "disable") {
      await disablePlanMode(ctx);
      return;
    }

    if (!enabled) await enablePlanMode(ctx);
    pi.sendUserMessage(raw);
  }

  // ── Commands / shortcuts ───────────────────────────────────────────
  pi.registerCommand("plan", {
    description: "Plan mode toggle. Usage: /plan, /plan on, /plan off, /plan <task>",
    handler: async (args, ctx) => planCommand(args, ctx),
  });

  pi.registerShortcut("ctrl+alt+p", {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      if (enabled) await disablePlanMode(ctx);
      else await enablePlanMode(ctx);
    },
  });

  // ── Events ─────────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const restored = restoreState(ctx);
    if (restored) {
      enabled = restored.enabled;
      previousTools = restored.previousTools ?? previousTools;
      modelBeforePlanRef = restored.modelBeforePlanRef;
      thinkingBeforePlan = restored.thinkingBeforePlan;
    }

    if (enabled) {
      const baseTools = previousTools.length > 0 ? previousTools : getNormalModeTools(pi, pi.getActiveTools());
      previousTools = getNormalModeTools(pi, baseTools);
      pi.setActiveTools(getPlanModeTools(pi, previousTools));
      await applyModeProfile(pi, ctx, "plan");
    } else {
      previousTools = getNormalModeTools(pi, pi.getActiveTools());
      pi.setActiveTools(previousTools);
    }

    setPlanStatus(ctx, enabled);
    syncToolsForCurrentMode();
  });

  // Keep tool toggles stable if other commands/extensions changed tools.
  pi.on("input", async () => {
    syncToolsForCurrentMode();
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return {};
    return { systemPrompt: (event.systemPrompt || "") + PLAN_MODE_PROMPT };
  });

  // Hard safety gate for bash while /plan is active.
  pi.on("tool_call", async (event) => {
    if (!enabled) return;
    if (event.toolName !== "bash") return;

    const command = String(event.input.command || "");
    if (!isSafePlanCommand(command)) {
      return { block: true, reason: "Plan mode only allows read-only bash commands. Blocked: " + command };
    }
  });
}
