import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { writePlanArtifact, readPlanArtifact, updatePlanStatus } from "./plan-artifact.js";

interface AskQuestionItem {
  id: string;
  question: string;
  placeholder?: string;
  defaultAnswer?: string;
  multiline?: boolean;
  required?: boolean;
}

interface AskQuestionsDetails {
  title?: string;
  questions: AskQuestionItem[];
  answers: Array<{ id: string; question: string; answer: string }>;
  cancelled?: boolean;
}

type PlanPhase = "clarify" | "wait_answers" | "plan";

interface PlanModeState {
  enabled: boolean;
  previousTools?: string[];
  phase?: PlanPhase;
  modelBeforePlanRef?: string;
  thinkingBeforePlan?: string;
  planPath?: string;
}

interface ModeProfileConfig {
  model?: string;
  thinkingLevel?: string;
}

interface PlanModeConfig {
  defaults?: ModeProfileConfig;
  plan?: ModeProfileConfig;
  implement?: ModeProfileConfig;
}

const PLAN_STATE_ENTRY = "question-first-plan-mode";

const PLAN_MODE_PROMPT = `

## Plan Mode (Question-First)

You are in plan mode.

Rules:
- Planning only. Do not implement, patch files, or perform write actions.
- Inspect the codebase with read-only tools when the task depends on repository context.
- If key information is still missing after relevant inspection, use the ask_questions tool before proposing a plan.
- Do not make silent assumptions about product requirements, UX, naming, API shape, data flow, edge cases, rollout, or testing expectations.
- Ask only the minimum useful questions, usually 1-5 at a time.
- Questions should be direct, neutral, and non-leading.
- If no clarifications are needed, explicitly say: "No clarifying questions needed."

After you have enough information, use the write_plan tool to save your plan as a markdown artifact. Include:
1. Objective
2. Clarifications / constraints
3. Assumptions (only if unavoidable)
4. Plan (numbered steps)
5. Validation / success criteria
6. Risks or follow-ups

The write_plan tool will save the plan to a markdown file and display it for review. Always use write_plan instead of writing the plan in your response text.
`;

const CLARIFY_FIRST_PROMPT = `

Current phase: clarification.
For this turn:
1) If the task needs repo context, inspect the codebase with read-only tools.
2) Ask clarifying questions only if still needed.
3) If you use ask_questions and receive answers in this same turn, immediately create the plan now with write_plan.
Do not ask for permission to proceed once clarifications are complete.
`;

const PLAN_FROM_ANSWERS_PROMPT = `

Current phase: planning.
Use the latest codebase context and the user's clarification answers to produce the full plan now.
Do not ask more clarifying questions in this turn.
Use the write_plan tool to save your plan as a markdown file with a "Plan:" header followed by numbered steps.
`;

const CUSTOM_CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-agent-custom.json");
const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
const PLAN_MODE_LEGACY_CONFIG_PATH = join(homedir(), ".pi", "agent", "plan-mode.json");
const VALID_THINKING_LEVELS = new Set(["off", "low", "medium", "high", "xhigh"]);
const PLAN_TOOL_WHITELIST = new Set(["read", "bash", "grep", "find", "ls", "web_fetch", "ask_questions", "write_plan"]);
const NO_CLARIFY_NEEDED_PATTERN = /no clarifying questions needed/i;

const DANGEROUS_BASH_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)\b/i,
  /\byarn\s+(add|remove|install|publish)\b/i,
  /\bpnpm\s+(add|remove|install|publish)\b/i,
  /\bpip\s+(install|uninstall)\b/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b/i,
  /\bbrew\s+(install|uninstall|upgrade)\b/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash|cherry-pick|revert|tag|init|clone)\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill(all)?\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_BASH_PATTERNS = [
  /^\s*cat\b/i,
  /^\s*head\b/i,
  /^\s*tail\b/i,
  /^\s*less\b/i,
  /^\s*more\b/i,
  /^\s*grep\b/i,
  /^\s*find\b/i,
  /^\s*ls\b/i,
  /^\s*pwd\b/i,
  /^\s*echo\b/i,
  /^\s*printf\b/i,
  /^\s*wc\b/i,
  /^\s*sort\b/i,
  /^\s*uniq\b/i,
  /^\s*diff\b/i,
  /^\s*file\b/i,
  /^\s*stat\b/i,
  /^\s*du\b/i,
  /^\s*df\b/i,
  /^\s*tree\b/i,
  /^\s*which\b/i,
  /^\s*whereis\b/i,
  /^\s*type\b/i,
  /^\s*uname\b/i,
  /^\s*whoami\b/i,
  /^\s*id\b/i,
  /^\s*date\b/i,
  /^\s*uptime\b/i,
  /^\s*ps\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-)\b/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
  /^\s*yarn\s+(list|info|why|audit)\b/i,
  /^\s*pnpm\s+(list|why|view|audit)\b/i,
  /^\s*node\s+--version\b/i,
  /^\s*python\s+--version\b/i,
  /^\s*python3\s+--version\b/i,
  /^\s*jq\b/i,
  /^\s*sed\s+-n\b/i,
  /^\s*awk\b/i,
  /^\s*rg\b/i,
  /^\s*fd\b/i,
  /^\s*bat\b/i,
];

function isSafePlanCommand(command: string): boolean {
  if (!command.trim()) return false;
  if (DANGEROUS_BASH_PATTERNS.some((pattern) => pattern.test(command))) return false;
  return SAFE_BASH_PATTERNS.some((pattern) => pattern.test(command));
}

function readJsonObject(path: string): Record<string, unknown> | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function loadPlanModeConfig(): PlanModeConfig {
  const customConfig = readJsonObject(CUSTOM_CONFIG_PATH);
  const customPlanMode = customConfig?.planMode;
  if (customPlanMode && typeof customPlanMode === "object" && !Array.isArray(customPlanMode)) {
    return customPlanMode as PlanModeConfig;
  }

  const settings = readJsonObject(SETTINGS_PATH);
  const settingsConfig = settings?.planMode;
  if (settingsConfig && typeof settingsConfig === "object" && !Array.isArray(settingsConfig)) {
    return settingsConfig as PlanModeConfig;
  }

  const legacy = readJsonObject(PLAN_MODE_LEGACY_CONFIG_PATH);
  return (legacy as PlanModeConfig | undefined) ?? {};
}

function setPlanStatus(ctx: ExtensionContext, enabled: boolean, phase: PlanPhase, _planPath?: string) {
  if (!ctx.hasUI) return;
  if (!enabled) {
    ctx.ui.setStatus("question-first-plan-mode", undefined);
    return;
  }

  const phaseText = phase === "clarify" ? "plan: clarify" : phase === "wait_answers" ? "plan: waiting /answer" : "plan";
  ctx.ui.setStatus("question-first-plan-mode", phaseText);
}

function persistState(pi: ExtensionAPI, state: PlanModeState) {
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
  const available = new Set(pi.getAllTools().map((tool) => tool.name));
  const result = previousTools.filter((name) => PLAN_TOOL_WHITELIST.has(name) && available.has(name));
  if (available.has("ask_questions") && !result.includes("ask_questions")) {
    result.push("ask_questions");
  }
  if (available.has("write_plan") && !result.includes("write_plan")) {
    result.push("write_plan");
  }
  return result;
}

function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const lines: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const maybe = block as { type?: string; text?: string };
    if (maybe.type === "text" && typeof maybe.text === "string") {
      lines.push(maybe.text);
    }
  }
  return lines.join("\n");
}

function getLastAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i] as { role?: string; content?: unknown };
    if (msg?.role === "assistant") {
      return getMessageText(msg.content);
    }
  }
  return "";
}

function extractPlanSteps(text: string): string[] {
  const header = text.match(/(?:^|\n)\s*\*{0,2}Plan:\*{0,2}\s*(?:\n|$)/i);
  if (!header) return [];

  const start = text.indexOf(header[0]) + header[0].length;
  const section = text.slice(start);
  const steps: string[] = [];

  for (const match of section.matchAll(/^\s*\d+[.)]\s+(.+)$/gim)) {
    const step = match[1].replace(/\*{1,2}/g, "").trim();
    if (step) steps.push(step);
  }

  return steps;
}

function planFingerprint(steps: string[]): string {
  return steps.map((step) => step.toLowerCase().replace(/\s+/g, " ").trim()).join("|");
}

function splitFrontmatter(markdownContent: string): { frontmatter?: string; body: string } {
  const normalized = markdownContent.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { body: markdownContent };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    return { body: markdownContent };
  }

  const frontmatter = normalized.slice(0, end + 5);
  const body = normalized.slice(end + 5);
  return { frontmatter, body: body.trimStart() };
}


export default function questionFirstPlanMode(pi: ExtensionAPI) {
  let enabled = false;
  let previousTools: string[] = [];
  let phase: PlanPhase = "clarify";
  let lastPromptedPlan = "";
  let askQuestionsUsedInClarify = false;
  let askQuestionsCancelledInClarify = false;
  let modelBeforePlanRef: string | undefined;
  let thinkingBeforePlan: string | undefined;
  let currentPlanPath: string | undefined;

  function persistCurrentState() {
    persistState(pi, { enabled, previousTools, phase, modelBeforePlanRef, thinkingBeforePlan, planPath: currentPlanPath });
  }

  function resetClarifyTracking() {
    askQuestionsUsedInClarify = false;
    askQuestionsCancelledInClarify = false;
  }

  function normalizeThinkingLevel(level: string | undefined): string | undefined {
    if (!level) return undefined;
    const normalized = level.trim().toLowerCase();
    return VALID_THINKING_LEVELS.has(normalized) ? normalized : undefined;
  }

  function currentModelRef(ctx: ExtensionContext): string | undefined {
    const model = ctx.model as { provider?: string; id?: string } | undefined;
    if (!model?.provider || !model.id) return undefined;
    return `${model.provider}/${model.id}`;
  }

  function resolveModelRef(ctx: ExtensionContext, modelRef: string): unknown {
    const trimmed = modelRef.trim();
    if (!trimmed) return undefined;

    if (trimmed.includes("/")) {
      const slash = trimmed.indexOf("/");
      const provider = trimmed.slice(0, slash).trim();
      const id = trimmed.slice(slash + 1).trim();
      if (!provider || !id) return undefined;
      return ctx.modelRegistry.find(provider, id);
    }

    const matches = ctx.modelRegistry.getAll().filter((model) => model.id === trimmed);

    if (matches.length === 1) return matches[0];

    if (matches.length > 1) {
      const provider = (ctx.model as { provider?: string } | undefined)?.provider;
      if (provider) {
        const sameProvider = matches.find((model) => model.provider === provider);
        if (sameProvider) return sameProvider;
      }
    }

    return undefined;
  }

  function resolveModeProfile(config: PlanModeConfig, mode: "plan" | "implement"): ModeProfileConfig | undefined {
    const defaults = config.defaults ?? {};
    const specific = config[mode] ?? {};

    const merged: ModeProfileConfig = {
      model: specific.model ?? defaults.model,
      thinkingLevel: specific.thinkingLevel ?? defaults.thinkingLevel,
    };

    if (!merged.model && !merged.thinkingLevel) return undefined;
    return merged;
  }

  async function applyModeProfile(ctx: ExtensionContext, mode: "plan" | "implement") {
    const config = loadPlanModeConfig();
    const profile = resolveModeProfile(config, mode);
    if (!profile) return;

    if (profile.model) {
      const model = resolveModelRef(ctx, profile.model);
      if (!model) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Plan mode config (${mode}.model/defaults.model) not found: ${profile.model}. Use provider/model-id when ambiguous.`,
            "warning",
          );
        }
      } else {
        const changed = await pi.setModel(model as any);
        if (!changed && ctx.hasUI) {
          ctx.ui.notify(`Could not switch to configured ${mode} model: ${profile.model}`, "warning");
        }
      }
    }

    if (profile.thinkingLevel) {
      const normalized = normalizeThinkingLevel(profile.thinkingLevel);
      if (!normalized) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `Plan mode config (${mode}.thinkingLevel/defaults.thinkingLevel) invalid: ${profile.thinkingLevel}. Allowed: off, low, medium, high, xhigh.`,
            "warning",
          );
        }
      } else {
        pi.setThinkingLevel(normalized as any);
      }
    }
  }

  async function restorePrePlanProfile(ctx: ExtensionContext) {
    if (modelBeforePlanRef) {
      const model = resolveModelRef(ctx, modelBeforePlanRef);
      if (model) {
        await pi.setModel(model as any);
      }
    }

    const normalizedThinking = normalizeThinkingLevel(thinkingBeforePlan);
    if (normalizedThinking) {
      pi.setThinkingLevel(normalizedThinking as any);
    }
  }

  async function enablePlanMode(ctx: ExtensionContext) {
    if (enabled) {
      setPlanStatus(ctx, true, phase, currentPlanPath);
      return;
    }

    modelBeforePlanRef = currentModelRef(ctx);
    thinkingBeforePlan = pi.getThinkingLevel?.();
    previousTools = pi.getActiveTools();
    const planTools = getPlanModeTools(pi, previousTools);
    pi.setActiveTools(planTools);
    enabled = true;
    phase = "clarify";
    lastPromptedPlan = "";
    currentPlanPath = undefined;
    resetClarifyTracking();
    await applyModeProfile(ctx, "plan");
    setPlanStatus(ctx, true, phase, currentPlanPath);
    if (ctx.hasUI) {
      ctx.ui.notify("Plan mode enabled: question-first planning with read-only tools.", "info");
    }
    persistCurrentState();
  }

  async function disablePlanMode(ctx: ExtensionContext, options?: { restoreModelProfile?: boolean }) {
    if (!enabled) {
      setPlanStatus(ctx, false, phase, currentPlanPath);
      return;
    }

    const restoreTools = previousTools.length > 0 ? previousTools : pi.getAllTools().map((tool) => tool.name);
    pi.setActiveTools(restoreTools);
    enabled = false;
    phase = "clarify";
    lastPromptedPlan = "";
    resetClarifyTracking();
    setPlanStatus(ctx, false, phase, currentPlanPath);
    if (ctx.hasUI) {
      ctx.ui.notify("Plan mode disabled.", "info");
    }

    if (options?.restoreModelProfile !== false) {
      await restorePrePlanProfile(ctx);
    }

    modelBeforePlanRef = undefined;
    thinkingBeforePlan = undefined;
    persistCurrentState();
  }

  async function planCommand(args: string, ctx: ExtensionCommandContext) {
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

    if (raw === "status") {
      ctx.ui.notify(enabled ? `Plan mode is ON (${phase})${currentPlanPath ? ` — ${currentPlanPath}` : ""}` : "Plan mode is OFF", "info");
      return;
    }

    if (!enabled) {
      await enablePlanMode(ctx);
    } else {
      phase = "clarify";
      lastPromptedPlan = "";
      resetClarifyTracking();
      setPlanStatus(ctx, true, phase, currentPlanPath);
      persistCurrentState();
    }
    pi.sendUserMessage(raw);
  }

  // ── write_plan tool ────────────────────────────────────────────────

  pi.registerTool({
    name: "write_plan",
    label: "Write Plan",
    description:
      "Save the plan as a markdown file artifact. Use this to persist your plan for review and implementation. Always use this instead of writing the plan in your response text.",
    promptSnippet: "Save the plan as a markdown artifact file",
    promptGuidelines: [
      "Always use write_plan to save your plan instead of writing it as plain text in your response.",
      "Include a clear title and structured markdown content with numbered steps.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short descriptive title for the plan (used as directory name)" }),
      content: Type.String({ description: "Full plan content in markdown format" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const filePath = writePlanArtifact(ctx.cwd, params.title, params.content);
        currentPlanPath = filePath;
        persistCurrentState();

        // Update status bar to show plan path
        setPlanStatus(ctx, true, phase, currentPlanPath);

        return {
          content: [{ type: "text", text: `Plan saved to ${filePath}` }],
          details: { filePath, title: params.title },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Failed to save plan: ${msg}` }],
          details: {},
          isError: true,
        };
      }
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("write_plan ")) + theme.fg("muted", args.title || ""),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as { filePath?: string; title?: string } | undefined;
      if (details?.filePath) {
        return new Text(
          theme.fg("success", "✓ ") + theme.fg("accent", "Plan saved: ") + theme.fg("muted", details.filePath),
          0,
          0,
        );
      }
      return new Text(theme.fg("success", "✓ Plan saved"), 0, 0);
    },
  });

  // ── ask_questions tool ─────────────────────────────────────────────

  pi.registerTool({
    name: "ask_questions",
    label: "Ask Questions",
    description:
      "Ask the user one or more clarifying questions and collect free-text answers. Use this when key requirements are missing and you should not assume.",
    promptSnippet:
      "Ask the user clarifying questions before planning or implementing when important information is missing.",
    promptGuidelines: [
      "Use ask_questions instead of silently assuming requirements when ambiguity materially affects the work.",
      "Ask only the minimum useful set of questions, usually 1-5.",
      "Keep questions direct, concrete, and non-leading.",
    ],
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: "Optional UI title shown above the questions" })),
      questions: Type.Array(
        Type.Object({
          id: Type.String({ description: "Stable identifier for the question" }),
          question: Type.String({ description: "The exact question to ask the user" }),
          placeholder: Type.Optional(Type.String({ description: "Optional placeholder shown in the input box" })),
          defaultAnswer: Type.Optional(Type.String({ description: "Optional default answer to prefill" })),
          multiline: Type.Optional(
            Type.Boolean({ description: "Use a multiline editor instead of a single-line input" }),
          ),
          required: Type.Optional(
            Type.Boolean({ description: "Whether an empty answer is disallowed. Default true." }),
          ),
        }),
        { minItems: 1, maxItems: 8, description: "Questions to ask the user" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const details: AskQuestionsDetails = {
        title: params.title,
        questions: params.questions,
        answers: [],
      };

      if (!ctx.hasUI) {
        details.cancelled = true;
        if (enabled && phase === "clarify") {
          askQuestionsUsedInClarify = true;
          askQuestionsCancelledInClarify = true;
        }
        return {
          content: [{ type: "text", text: "Error: ask_questions requires interactive mode." }],
          details,
        };
      }

      const totalQuestions = params.questions.length;
      const answers: string[] = Array.from({ length: totalQuestions }, () => "");

      const cancelAndReturn = (): {
        content: Array<{ type: "text"; text: string }>;
        details: AskQuestionsDetails;
      } => {
        details.cancelled = true;
        if (enabled && phase === "clarify") {
          askQuestionsUsedInClarify = true;
          askQuestionsCancelledInClarify = true;
        }
        return {
          content: [{ type: "text", text: "User cancelled the clarification questions." }],
          details,
        };
      };

      const askOne = async (item: AskQuestionItem, index: number): Promise<string | undefined> => {
        const required = item.required !== false;
        const progress = `[${index + 1}/${totalQuestions}]`;
        const meta = `${required ? "required" : "optional"}${item.multiline ? ", multiline" : ""}`;
        const defaultHint = item.defaultAnswer?.trim() ? `\nDefault: ${item.defaultAnswer}` : "";
        const promptTitle = `${progress} ${item.question}\n(${meta})${defaultHint}`;

        while (true) {
          const prefill = answers[index] || item.defaultAnswer || "";
          const answer = item.multiline
            ? await ctx.ui.editor(promptTitle, prefill)
            : await ctx.ui.input(promptTitle, item.placeholder ?? (prefill ? `default: ${prefill}` : ""));

          if (answer === undefined) return undefined;

          const fallback = item.defaultAnswer?.trim() || "";
          const normalized = answer.trim() || fallback;
          if (!normalized && required) {
            ctx.ui.notify(`Question ${index + 1} requires an answer.`, "warning");
            continue;
          }

          return normalized;
        }
      };

      for (let i = 0; i < totalQuestions; i += 1) {
        const response = await askOne(params.questions[i], i);
        if (response === undefined) {
          return cancelAndReturn();
        }
        answers[i] = response;
      }

      while (totalQuestions > 1) {
        const choice = await ctx.ui.select("Review clarification answers", ["Submit answers", "Edit an answer", "Cancel"]);
        if (!choice || choice === "Cancel") {
          return cancelAndReturn();
        }
        if (choice === "Submit answers") {
          break;
        }

        const options = params.questions.map((item, index) => {
          const text = answers[index] || "(empty)";
          const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
          return `${index + 1}. ${item.id}: ${preview}`;
        });

        const selection = await ctx.ui.select("Select an answer to edit", options);
        if (!selection) {
          continue;
        }

        const match = selection.match(/^(\d+)\./);
        if (!match) {
          continue;
        }

        const selectedIndex = Number(match[1]) - 1;
        if (selectedIndex < 0 || selectedIndex >= totalQuestions) {
          continue;
        }

        const updated = await askOne(params.questions[selectedIndex], selectedIndex);
        if (updated === undefined) {
          return cancelAndReturn();
        }
        answers[selectedIndex] = updated;
      }

      details.answers = params.questions.map((item, index) => ({
        id: item.id,
        question: item.question,
        answer: answers[index] || "",
      }));

      if (enabled && phase === "clarify") {
        askQuestionsUsedInClarify = true;
        askQuestionsCancelledInClarify = false;
      }

      const lines = details.answers.map((entry) => `- ${entry.id}: ${entry.answer || "(empty)"}`);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details,
      };
    },
    renderCall(args, theme) {
      const count = Array.isArray(args.questions) ? args.questions.length : 0;
      return new Text(
        theme.fg("toolTitle", theme.bold("ask_questions ")) +
          theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AskQuestionsDetails | undefined;
      if (!details) {
        const textBlock = result.content.find((block) => block.type === "text");
        return new Text(textBlock?.type === "text" ? textBlock.text : "", 0, 0);
      }
      if (details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }
      const lines = details.answers.map(
        (entry) =>
          `${theme.fg("success", "✓ ")}${theme.fg("accent", entry.id)}: ${entry.answer || theme.fg("dim", "(empty)")}`,
      );
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  // ── Commands ───────────────────────────────────────────────────────

  pi.registerCommand("plan", {
    description: "Question-first plan mode. Usage: /plan, /plan on, /plan off, /plan status, /plan <task>",
    handler: async (args, ctx) => planCommand(args, ctx),
  });

  pi.registerCommand("planview", {
    description: "View the current plan markdown artifact",
    handler: async (_args, ctx) => {
      if (!currentPlanPath) {
        ctx.ui.notify("No plan file exists yet. Use /plan to create one.", "info");
        return;
      }
      const content = readPlanArtifact(currentPlanPath);
      if (!content) {
        ctx.ui.notify(`Plan file not found: ${currentPlanPath}`, "error");
        return;
      }

      const titleMatch = content.match(/^title:\s*"(.+)"/m);
      const title = titleMatch ? titleMatch[1] : "Plan";
      const split = splitFrontmatter(content);
      const body = split.body.trim() || content;

      pi.sendMessage({
        customType: "plan-mode-planview",
        content: `## ${title}\n\n${body}\n\n---\n📄 ${currentPlanPath}`,
        display: true,
      });
    },
  });

  pi.registerShortcut("ctrl+alt+p", {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      if (enabled) await disablePlanMode(ctx);
      else await enablePlanMode(ctx);
    },
  });

  // ── Events ──────────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const restored = restoreState(ctx);
    if (restored) {
      enabled = restored.enabled;
      previousTools = restored.previousTools ?? previousTools;
      phase = restored.phase ?? phase;
      modelBeforePlanRef = restored.modelBeforePlanRef;
      thinkingBeforePlan = restored.thinkingBeforePlan;
      currentPlanPath = restored.planPath;
    }
    if (enabled) {
      const baseTools = previousTools.length > 0 ? previousTools : pi.getActiveTools();
      pi.setActiveTools(getPlanModeTools(pi, baseTools));
      await applyModeProfile(ctx, "plan");
    }
    resetClarifyTracking();
    setPlanStatus(ctx, enabled, phase, currentPlanPath);
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!enabled) return {};

    if (phase === "wait_answers") {
      phase = "plan";
      lastPromptedPlan = "";
      persistCurrentState();
    }

    let prompt = (event.systemPrompt || "") + PLAN_MODE_PROMPT;
    if (phase === "clarify") {
      prompt += CLARIFY_FIRST_PROMPT;
    } else if (phase === "plan") {
      prompt += PLAN_FROM_ANSWERS_PROMPT;
    }

    return { systemPrompt: prompt };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!enabled || !ctx.hasUI) return;

    const lastAssistantText = getLastAssistantText((event as { messages?: unknown }).messages);
    if (!lastAssistantText) return;

    if (phase === "clarify") {
      const assistantAlreadyPlanned = Boolean(currentPlanPath) || extractPlanSteps(lastAssistantText).length > 0;

      if (askQuestionsUsedInClarify && !askQuestionsCancelledInClarify) {
        phase = "plan";
        setPlanStatus(ctx, true, phase, currentPlanPath);
        persistCurrentState();
        resetClarifyTracking();

        if (!assistantAlreadyPlanned) {
          pi.sendMessage(
            {
              customType: "plan-mode-auto-plan",
              content: "Generate the plan now using the clarification answers already collected. Use the write_plan tool to save it.",
              display: false,
            },
            { triggerTurn: true },
          );
          return;
        }
      } else if (!askQuestionsUsedInClarify && NO_CLARIFY_NEEDED_PATTERN.test(lastAssistantText)) {
        phase = "plan";
        setPlanStatus(ctx, true, phase, currentPlanPath);
        persistCurrentState();
        resetClarifyTracking();

        if (!assistantAlreadyPlanned) {
          pi.sendMessage(
            {
              customType: "plan-mode-auto-plan",
              content: "No clarifying questions were needed. Generate the full plan now using the write_plan tool.",
              display: false,
            },
            { triggerTurn: true },
          );
          return;
        }
      } else {
        phase = "wait_answers";
        setPlanStatus(ctx, true, phase, currentPlanPath);
        persistCurrentState();
        resetClarifyTracking();
        ctx.ui.notify("Reply with /answer <responses> (or a normal message), then I will generate the plan.", "info");
        return;
      }
    }

    if (phase !== "plan") return;

    const planContent = currentPlanPath ? readPlanArtifact(currentPlanPath) : null;
    const steps = extractPlanSteps(lastAssistantText);
    if (steps.length === 0 && !currentPlanPath) return;

    // Only prompt action if we haven't already prompted this plan
    const fingerprint = steps.length > 0 ? planFingerprint(steps) : currentPlanPath;
    if (!fingerprint || fingerprint === lastPromptedPlan) return;
    lastPromptedPlan = fingerprint;

    if (planContent && currentPlanPath) {
      const titleMatch = planContent.match(/^title:\s*"(.+)"/m);
      const title = titleMatch ? titleMatch[1] : "Plan";
      const split = splitFrontmatter(planContent);
      const body = split.body.trim() || planContent;
      pi.sendMessage({
        customType: "plan-mode-rendered-plan",
        content: `## ${title}\n\n${body}\n\n---\n📄 ${currentPlanPath}`,
        display: true,
      });
    }

    const choices = ["Implement now (exit plan mode)", "Stay in plan mode", "Refine the plan"];
    const choice = await ctx.ui.select("Plan ready — what next?", choices);

    if (choice?.startsWith("Implement")) {
      // Update plan status to "approved"
      if (currentPlanPath) {
        updatePlanStatus(currentPlanPath, "approved");
      }
      await disablePlanMode(ctx, { restoreModelProfile: false });
      await applyModeProfile(ctx, "implement");

      pi.sendMessage(
        { customType: "plan-mode-implement", content: "Implement the approved plan now.", display: true },
        { triggerTurn: true },
      );
      return;
    }

    if (choice === "Refine the plan") {
      const refinement = await ctx.ui.editor("Refine the plan:", "");
      if (refinement?.trim()) {
        lastPromptedPlan = "";
        pi.sendUserMessage(refinement.trim());
      }
    }
  });

  pi.on("tool_call", async (event) => {
    if (!enabled) return;

    if (event.toolName !== "bash") return;

    const command = String(event.input.command || "");
    if (!isSafePlanCommand(command)) {
      return {
        block: true,
        reason: `Plan mode only allows read-only bash commands. Blocked: ${command}`,
      };
    }
  });
}
