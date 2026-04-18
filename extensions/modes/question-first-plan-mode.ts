import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { writePlanArtifact, readPlanArtifact, updatePlanStatus } from "./plan-artifact.js";
import { isSafePlanCommand } from "./plan/bash-safety.js";
import {
  PLAN_MODE_PROMPT,
  CLARIFY_FIRST_PROMPT,
  PLAN_FROM_ANSWERS_PROMPT,
  PLAN_TOOL_WHITELIST,
  NO_CLARIFY_NEEDED_PATTERN,
} from "./plan/plan-prompts.js";
import {
  loadPlanModeConfig,
  resolveModeProfile,
  currentModelRef,
  resolveModelRef,
  applyModeProfile,
  restorePrePlanProfile,
  normalizeThinkingLevel,
} from "./plan/plan-config.js";

type PlanPhase = "clarify" | "wait_answers" | "plan";

interface PlanModeState {
  enabled: boolean;
  previousTools?: string[];
  phase?: PlanPhase;
  modelBeforePlanRef?: string;
  thinkingBeforePlan?: string;
  planPath?: string;
}

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

const PLAN_STATE_ENTRY = "question-first-plan-mode";

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
  if (available.has("ask_questions") && !result.includes("ask_questions")) result.push("ask_questions");
  if (available.has("write_plan") && !result.includes("write_plan")) result.push("write_plan");
  return result;
}

function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const lines: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const maybe = block as { type?: string; text?: string };
    if (maybe.type === "text" && typeof maybe.text === "string") lines.push(maybe.text);
  }
  return lines.join("\n");
}

function getLastAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i] as { role?: string; content?: unknown };
    if (msg?.role === "assistant") return getMessageText(msg.content);
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
  if (!normalized.startsWith("---\n")) return { body: markdownContent };
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) return { body: markdownContent };
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

  async function enablePlanMode(ctx: ExtensionContext) {
    if (enabled) { setPlanStatus(ctx, true, phase, currentPlanPath); return; }
    modelBeforePlanRef = currentModelRef(ctx);
    thinkingBeforePlan = pi.getThinkingLevel?.();
    previousTools = pi.getActiveTools();
    pi.setActiveTools(getPlanModeTools(pi, previousTools));
    enabled = true;
    phase = "clarify";
    lastPromptedPlan = "";
    currentPlanPath = undefined;
    resetClarifyTracking();
    await applyModeProfile(pi, ctx, "plan");
    setPlanStatus(ctx, true, phase, currentPlanPath);
    if (ctx.hasUI) ctx.ui.notify("Plan mode enabled: question-first planning with read-only tools.", "info");
    persistCurrentState();
  }

  async function disablePlanMode(ctx: ExtensionContext, options?: { restoreModelProfile?: boolean }) {
    if (!enabled) { setPlanStatus(ctx, false, phase, currentPlanPath); return; }
    const restoreTools = previousTools.length > 0 ? previousTools : pi.getAllTools().map((tool) => tool.name);
    pi.setActiveTools(restoreTools);
    enabled = false;
    phase = "clarify";
    lastPromptedPlan = "";
    resetClarifyTracking();
    setPlanStatus(ctx, false, phase, currentPlanPath);
    if (ctx.hasUI) ctx.ui.notify("Plan mode disabled.", "info");
    if (options?.restoreModelProfile !== false) {
      await restorePrePlanProfile(pi, ctx, modelBeforePlanRef, thinkingBeforePlan);
    }
    modelBeforePlanRef = undefined;
    thinkingBeforePlan = undefined;
    persistCurrentState();
  }

  // ── write_plan tool ────────────────────────────────────────────────
  pi.registerTool({
    name: "write_plan",
    label: "Write Plan",
    description: "Save the plan as a markdown file artifact. Use this to persist your plan for review and implementation.",
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
        setPlanStatus(ctx, true, phase, currentPlanPath);
        return { content: [{ type: "text", text: "Plan saved to " + filePath }], details: { filePath, title: params.title } };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: "Failed to save plan: " + msg }], details: {}, isError: true };
      }
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("write_plan ")) + theme.fg("muted", args.title || ""), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as { filePath?: string } | undefined;
      if (details?.filePath) return new Text(theme.fg("success", "✓ ") + theme.fg("accent", "Plan saved: ") + theme.fg("muted", details.filePath), 0, 0);
      return new Text(theme.fg("success", "✓ Plan saved"), 0, 0);
    },
  });

  // ── ask_questions tool ─────────────────────────────────────────────
  pi.registerTool({
    name: "ask_questions",
    label: "Ask Questions",
    description: "Ask the user one or more clarifying questions and collect free-text answers.",
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
          placeholder: Type.Optional(Type.String({ description: "Optional placeholder" })),
          defaultAnswer: Type.Optional(Type.String({ description: "Optional default answer" })),
          multiline: Type.Optional(Type.Boolean({ description: "Use a multiline editor" })),
          required: Type.Optional(Type.Boolean({ description: "Whether empty answer is disallowed. Default true." })),
        }),
        { minItems: 1, maxItems: 8, description: "Questions to ask the user" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const details: AskQuestionsDetails = { title: params.title, questions: params.questions, answers: [], };
      if (!ctx.hasUI) {
        details.cancelled = true;
        if (enabled && phase === "clarify") { askQuestionsUsedInClarify = true; askQuestionsCancelledInClarify = true; }
        return { content: [{ type: "text", text: "Error: ask_questions requires interactive mode." }], details };
      }
      const totalQuestions = params.questions.length;
      const answers: string[] = Array.from({ length: totalQuestions }, () => "");
      const cancelAndReturn = () => {
        details.cancelled = true;
        if (enabled && phase === "clarify") { askQuestionsUsedInClarify = true; askQuestionsCancelledInClarify = true; }
        return { content: [{ type: "text" as const, text: "User cancelled the clarification questions." }], details };
      };
      const askOne = async (item: AskQuestionItem, index: number): Promise<string | undefined> => {
        const required = item.required !== false;
        const progress = "[" + (index + 1) + "/" + totalQuestions + "]";
        const meta = (required ? "required" : "optional") + (item.multiline ? ", multiline" : "");
        const defaultHint = item.defaultAnswer?.trim() ? "\nDefault: " + item.defaultAnswer : "";
        const promptTitle = progress + " " + item.question + "\n(" + meta + ")" + defaultHint;
        while (true) {
          const prefill = answers[index] || item.defaultAnswer || "";
          const answer = item.multiline
            ? await ctx.ui.editor(promptTitle, prefill)
            : await ctx.ui.input(promptTitle, item.placeholder ?? (prefill ? "default: " + prefill : ""));
          if (answer === undefined) return undefined;
          const fallback = item.defaultAnswer?.trim() || "";
          const normalized = answer.trim() || fallback;
          if (!normalized && required) { ctx.ui.notify("Question " + (index + 1) + " requires an answer.", "warning"); continue; }
          return normalized;
        }
      };
      for (let i = 0; i < totalQuestions; i += 1) {
        const response = await askOne(params.questions[i], i);
        if (response === undefined) return cancelAndReturn();
        answers[i] = response;
      }
      while (totalQuestions > 1) {
        const choice = await ctx.ui.select("Review clarification answers", ["Submit answers", "Edit an answer", "Cancel"]);
        if (!choice || choice === "Cancel") return cancelAndReturn();
        if (choice === "Submit answers") break;
        const options = params.questions.map((item, index) => {
          const text = answers[index] || "(empty)";
          const preview = text.length > 80 ? text.slice(0, 77) + "..." : text;
          return (index + 1) + ". " + item.id + ": " + preview;
        });
        const selection = await ctx.ui.select("Select an answer to edit", options);
        if (!selection) continue;
        const match = selection.match(/^(\d+)\./);
        if (!match) continue;
        const selectedIndex = Number(match[1]) - 1;
        if (selectedIndex < 0 || selectedIndex >= totalQuestions) continue;
        const updated = await askOne(params.questions[selectedIndex], selectedIndex);
        if (updated === undefined) return cancelAndReturn();
        answers[selectedIndex] = updated;
      }
      details.answers = params.questions.map((item, index) => ({ id: item.id, question: item.question, answer: answers[index] || "" }));
      if (enabled && phase === "clarify") { askQuestionsUsedInClarify = true; askQuestionsCancelledInClarify = false; }
      const lines = details.answers.map((entry) => "- " + entry.id + ": " + (entry.answer || "(empty)"));
      return { content: [{ type: "text", text: lines.join("\n") }], details };
    },
    renderCall(args, theme) {
      const count = Array.isArray(args.questions) ? args.questions.length : 0;
      return new Text(theme.fg("toolTitle", theme.bold("ask_questions ")) + theme.fg("muted", count + " question" + (count === 1 ? "" : "s")), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as AskQuestionsDetails | undefined;
      if (!details) { const tb = result.content.find((b) => b.type === "text"); return new Text(tb?.type === "text" ? tb.text : "", 0, 0); }
      if (details.cancelled) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      const lines = details.answers.map((e) => theme.fg("success", "✓ ") + theme.fg("accent", e.id) + ": " + (e.answer || theme.fg("dim", "(empty)")));
      return new Text(lines.join("\n"), 0, 0);
    },
  });

  // ── Commands ───────────────────────────────────────────────────────
  async function planCommand(args: string, ctx: ExtensionCommandContext) {
    const raw = (args || "").trim();
    if (!raw) { if (enabled) await disablePlanMode(ctx); else await enablePlanMode(ctx); return; }
    if (raw === "on" || raw === "enable") { await enablePlanMode(ctx); return; }
    if (raw === "off" || raw === "disable") { await disablePlanMode(ctx); return; }
    if (raw === "status") { ctx.ui.notify(enabled ? "Plan mode is ON (" + phase + ")" + (currentPlanPath ? " — " + currentPlanPath : "") : "Plan mode is OFF", "info"); return; }
    if (!enabled) { await enablePlanMode(ctx); } else { phase = "clarify"; lastPromptedPlan = ""; resetClarifyTracking(); setPlanStatus(ctx, true, phase, currentPlanPath); persistCurrentState(); }
    pi.sendUserMessage(raw);
  }

  pi.registerCommand("plan", { description: "Question-first plan mode. Usage: /plan, /plan on, /plan off, /plan status, /plan <task>", handler: async (args, ctx) => planCommand(args, ctx) });
  pi.registerCommand("planview", {
    description: "View the current plan markdown artifact",
    handler: async (_args, ctx) => {
      if (!currentPlanPath) { ctx.ui.notify("No plan file exists yet. Use /plan to create one.", "info"); return; }
      const content = readPlanArtifact(currentPlanPath);
      if (!content) { ctx.ui.notify("Plan file not found: " + currentPlanPath, "error"); return; }
      const titleMatch = content.match(/^title:\s*"(.+)"/m);
      const title = titleMatch ? titleMatch[1] : "Plan";
      const split = splitFrontmatter(content);
      const body = split.body.trim() || content;
      pi.sendMessage({ customType: "plan-mode-planview", content: "## " + title + "\n\n" + body + "\n\n---\n📄 " + currentPlanPath, display: true });
    },
  });
  pi.registerShortcut("ctrl+alt+p", { description: "Toggle plan mode", handler: async (ctx) => { if (enabled) await disablePlanMode(ctx); else await enablePlanMode(ctx); } });

  // ── Events ──────────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const restored = restoreState(ctx);
    if (restored) { enabled = restored.enabled; previousTools = restored.previousTools ?? previousTools; phase = restored.phase ?? phase; modelBeforePlanRef = restored.modelBeforePlanRef; thinkingBeforePlan = restored.thinkingBeforePlan; currentPlanPath = restored.planPath; }
    if (enabled) { const baseTools = previousTools.length > 0 ? previousTools : pi.getActiveTools(); pi.setActiveTools(getPlanModeTools(pi, baseTools)); await applyModeProfile(pi, ctx, "plan"); }
    resetClarifyTracking();
    setPlanStatus(ctx, enabled, phase, currentPlanPath);
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!enabled) return {};
    if (phase === "wait_answers") { phase = "plan"; lastPromptedPlan = ""; persistCurrentState(); }
    let prompt = (event.systemPrompt || "") + PLAN_MODE_PROMPT;
    if (phase === "clarify") prompt += CLARIFY_FIRST_PROMPT;
    else if (phase === "plan") prompt += PLAN_FROM_ANSWERS_PROMPT;
    return { systemPrompt: prompt };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!enabled || !ctx.hasUI) return;
    const lastAssistantText = getLastAssistantText((event as { messages?: unknown }).messages);
    if (!lastAssistantText) return;

    if (phase === "clarify") {
      const assistantAlreadyPlanned = Boolean(currentPlanPath) || extractPlanSteps(lastAssistantText).length > 0;
      if (askQuestionsUsedInClarify && !askQuestionsCancelledInClarify) {
        phase = "plan"; setPlanStatus(ctx, true, phase, currentPlanPath); persistCurrentState(); resetClarifyTracking();
        if (!assistantAlreadyPlanned) { pi.sendMessage({ customType: "plan-mode-auto-plan", content: "Generate the plan now using the clarification answers already collected. Use the write_plan tool to save it.", display: false }, { triggerTurn: true }); return; }
      } else if (!askQuestionsUsedInClarify && NO_CLARIFY_NEEDED_PATTERN.test(lastAssistantText)) {
        phase = "plan"; setPlanStatus(ctx, true, phase, currentPlanPath); persistCurrentState(); resetClarifyTracking();
        if (!assistantAlreadyPlanned) { pi.sendMessage({ customType: "plan-mode-auto-plan", content: "No clarifying questions were needed. Generate the full plan now using the write_plan tool.", display: false }, { triggerTurn: true }); return; }
      } else {
        phase = "wait_answers"; setPlanStatus(ctx, true, phase, currentPlanPath); persistCurrentState(); resetClarifyTracking();
        ctx.ui.notify("Reply with /answer <responses> (or a normal message), then I will generate the plan.", "info"); return;
      }
    }

    if (phase !== "plan") return;
    const planContent = currentPlanPath ? readPlanArtifact(currentPlanPath) : null;
    const steps = extractPlanSteps(lastAssistantText);
    if (steps.length === 0 && !currentPlanPath) return;
    const fingerprint = steps.length > 0 ? planFingerprint(steps) : currentPlanPath;
    if (!fingerprint || fingerprint === lastPromptedPlan) return;
    lastPromptedPlan = fingerprint;

    if (planContent && currentPlanPath) {
      const titleMatch = planContent.match(/^title:\s*"(.+)"/m);
      const title = titleMatch ? titleMatch[1] : "Plan";
      const split = splitFrontmatter(planContent);
      const body = split.body.trim() || planContent;
      pi.sendMessage({ customType: "plan-mode-rendered-plan", content: "## " + title + "\n\n" + body + "\n\n---\n📄 " + currentPlanPath, display: true });
    }

    const choices = ["Implement now (exit plan mode)", "Stay in plan mode", "Refine the plan"];
    const choice = await ctx.ui.select("Plan ready — what next?", choices);
    if (choice?.startsWith("Implement")) {
      if (currentPlanPath) updatePlanStatus(currentPlanPath, "approved");
      await disablePlanMode(ctx, { restoreModelProfile: false });
      await applyModeProfile(pi, ctx, "implement");
      pi.sendMessage({ customType: "plan-mode-implement", content: "Implement the approved plan now.", display: true }, { triggerTurn: true });
      return;
    }
    if (choice === "Refine the plan") {
      const refinement = await ctx.ui.editor("Refine the plan:", "");
      if (refinement?.trim()) { lastPromptedPlan = ""; pi.sendUserMessage(refinement.trim()); }
    }
  });

  pi.on("tool_call", async (event) => {
    if (!enabled) return;
    if (event.toolName !== "bash") return;
    const command = String(event.input.command || "");
    if (!isSafePlanCommand(command)) {
      return { block: true, reason: "Plan mode only allows read-only bash commands. Blocked: " + command };
    }
  });
}
