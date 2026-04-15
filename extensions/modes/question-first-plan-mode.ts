import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";

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
}

const PLAN_MODE_PROMPT = `

## Plan Mode (Question-First)

You are in plan mode.

Rules:
- Planning only. Do not implement, patch files, or perform write actions.
- First understand the request, then inspect the codebase with read-only tools if needed.
- If key information is missing, use the ask_questions tool before proposing a plan.
- Do not make silent assumptions about product requirements, UX, naming, API shape, data flow, edge cases, rollout, or testing expectations.
- Ask only the minimum useful questions, usually 1-5 at a time.
- Questions should be direct, neutral, and non-leading.
- If no clarifications are needed, explicitly say: "No clarifying questions needed."

After you have enough information, respond with this structure:
1. Objective
2. Clarifications / constraints
3. Assumptions (only if unavoidable)
4. Plan (numbered)
5. Validation / success criteria
6. Risks or follow-ups
`;

const CLARIFY_FIRST_PROMPT = `

Current phase: clarification.
For this turn, ask clarifying questions only, then stop.
Do not provide a plan in this turn.
Tell the user they can respond with /answer <responses> (or a normal message).
`;

const PLAN_FROM_ANSWERS_PROMPT = `

Current phase: planning.
Use the user's latest clarification answers and produce the full plan now.
Include a "Plan:" header followed by numbered steps.
`;

const PLAN_STATE_ENTRY = "question-first-plan-mode";
const PLAN_TOOL_WHITELIST = new Set(["read", "bash", "grep", "find", "ls", "web_fetch", "ask_questions"]);
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

function setPlanStatus(ctx: ExtensionContext, enabled: boolean, phase: PlanPhase) {
  if (!ctx.hasUI) return;
  if (!enabled) {
    ctx.ui.setStatus("question-first-plan-mode", undefined);
    return;
  }

  const text =
    phase === "clarify"
      ? "plan: clarify"
      : phase === "wait_answers"
        ? "plan: waiting /answer"
        : "plan";
  ctx.ui.setStatus("question-first-plan-mode", text);
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

export default function questionFirstPlanMode(pi: ExtensionAPI) {
  let enabled = false;
  let previousTools: string[] = [];
  let phase: PlanPhase = "clarify";
  let lastPromptedPlan = "";

  async function enablePlanMode(ctx: ExtensionContext) {
    if (enabled) {
      setPlanStatus(ctx, true, phase);
      return;
    }

    previousTools = pi.getActiveTools();
    const planTools = getPlanModeTools(pi, previousTools);
    pi.setActiveTools(planTools);
    enabled = true;
    phase = "clarify";
    lastPromptedPlan = "";
    setPlanStatus(ctx, true, phase);
    if (ctx.hasUI) {
      ctx.ui.notify("Plan mode enabled: question-first planning with read-only tools.", "info");
    }
    persistState(pi, { enabled: true, previousTools, phase });
  }

  async function disablePlanMode(ctx: ExtensionContext) {
    if (!enabled) {
      setPlanStatus(ctx, false, phase);
      return;
    }

    const restoreTools = previousTools.length > 0 ? previousTools : pi.getAllTools().map((tool) => tool.name);
    pi.setActiveTools(restoreTools);
    enabled = false;
    phase = "clarify";
    lastPromptedPlan = "";
    setPlanStatus(ctx, false, phase);
    if (ctx.hasUI) {
      ctx.ui.notify("Plan mode disabled.", "info");
    }
    persistState(pi, { enabled: false, previousTools, phase });
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
      ctx.ui.notify(enabled ? `Plan mode is ON (${phase})` : "Plan mode is OFF", "info");
      return;
    }

    if (!enabled) {
      await enablePlanMode(ctx);
    } else {
      phase = "clarify";
      lastPromptedPlan = "";
      setPlanStatus(ctx, true, phase);
      persistState(pi, { enabled: true, previousTools, phase });
    }
    pi.sendUserMessage(raw);
  }

  pi.registerTool({
    name: "ask_questions",
    label: "Ask Questions",
    description: "Ask the user one or more clarifying questions and collect free-text answers. Use this when key requirements are missing and you should not assume.",
    promptSnippet: "Ask the user clarifying questions before planning or implementing when important information is missing.",
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
          multiline: Type.Optional(Type.Boolean({ description: "Use a multiline editor instead of a single-line input" })),
          required: Type.Optional(Type.Boolean({ description: "Whether an empty answer is disallowed. Default true." })),
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
        return {
          content: [{ type: "text", text: "Error: ask_questions requires interactive mode." }],
          details,
        };
      }

      for (const item of params.questions) {
        const required = item.required !== false;
        while (true) {
          const answer = item.multiline
            ? await ctx.ui.editor(item.question, item.defaultAnswer ?? "")
            : await ctx.ui.input(item.question, item.placeholder ?? item.defaultAnswer ?? "");

          if (answer === undefined) {
            details.cancelled = true;
            return {
              content: [{ type: "text", text: "User cancelled the clarification questions." }],
              details,
            };
          }

          const normalized = answer.trim();
          if (!normalized && required) {
            ctx.ui.notify("This question needs an answer.", "warning");
            continue;
          }

          details.answers.push({
            id: item.id,
            question: item.question,
            answer: normalized,
          });
          break;
        }
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
        theme.fg("toolTitle", theme.bold("ask_questions ")) + theme.fg("muted", `${count} question${count === 1 ? "" : "s"}`),
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
      const lines = details.answers.map((entry) => `${theme.fg("success", "✓ ")}${theme.fg("accent", entry.id)}: ${entry.answer || theme.fg("dim", "(empty)")}`);
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  pi.registerCommand("plan", {
    description: "Question-first plan mode. Usage: /plan, /plan on, /plan off, /plan status, /plan <task>",
    handler: async (args, ctx) => planCommand(args, ctx),
  });

  pi.registerShortcut("ctrl+alt+p", {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      if (enabled) await disablePlanMode(ctx);
      else await enablePlanMode(ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const restored = restoreState(ctx);
    if (restored) {
      enabled = restored.enabled;
      previousTools = restored.previousTools ?? previousTools;
      phase = restored.phase ?? phase;
    }
    if (enabled) {
      const baseTools = previousTools.length > 0 ? previousTools : pi.getActiveTools();
      pi.setActiveTools(getPlanModeTools(pi, baseTools));
    }
    setPlanStatus(ctx, enabled, phase);
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!enabled) return {};

    if (phase === "wait_answers") {
      phase = "plan";
      lastPromptedPlan = "";
      persistState(pi, { enabled: true, previousTools, phase });
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
      phase = "wait_answers";
      setPlanStatus(ctx, true, phase);
      persistState(pi, { enabled: true, previousTools, phase });
      ctx.ui.notify("Reply with /answer <responses> (or a normal message), then I will generate the plan.", "info");
      return;
    }

    if (phase !== "plan") return;

    const steps = extractPlanSteps(lastAssistantText);
    if (steps.length === 0) return;

    const fingerprint = planFingerprint(steps);
    if (!fingerprint || fingerprint === lastPromptedPlan) return;
    lastPromptedPlan = fingerprint;

    const choice = await ctx.ui.select("Plan ready — what next?", [
      "Implement now (exit plan mode)",
      "Stay in plan mode",
      "Refine the plan",
    ]);

    if (choice?.startsWith("Implement")) {
      await disablePlanMode(ctx);
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
    if (!enabled || event.toolName !== "bash") return;
    const command = String(event.input.command || "");
    if (isSafePlanCommand(command)) return;
    return {
      block: true,
      reason: `Plan mode only allows read-only bash commands. Blocked: ${command}`,
    };
  });
}
