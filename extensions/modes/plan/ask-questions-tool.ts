import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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

/**
 * Registers an always-available ask_questions tool.
 *
 * This tool is intentionally mode-agnostic so the assistant can clarify
 * requirements in both normal and /plan mode.
 */
export function registerAskQuestionsTool(pi: ExtensionAPI): void {
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
      const details: AskQuestionsDetails = { title: params.title, questions: params.questions, answers: [] };

      if (!ctx.hasUI) {
        details.cancelled = true;
        return { content: [{ type: "text", text: "Error: ask_questions requires interactive mode." }], details };
      }

      const totalQuestions = params.questions.length;
      const answers: string[] = Array.from({ length: totalQuestions }, () => "");

      const cancelAndReturn = () => {
        details.cancelled = true;
        return { content: [{ type: "text" as const, text: "User cancelled the clarification questions." }], details };
      };

      const askOne = async (item: AskQuestionItem, index: number): Promise<string | undefined> => {
        const required = item.required !== false;
        const progress = `[${index + 1}/${totalQuestions}]`;
        const meta = (required ? "required" : "optional") + (item.multiline ? ", multiline" : "");
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
        if (response === undefined) return cancelAndReturn();
        answers[i] = response;
      }

      while (totalQuestions > 1) {
        const choice = await ctx.ui.select("Review clarification answers", ["Submit answers", "Edit an answer", "Cancel"]);
        if (!choice || choice === "Cancel") return cancelAndReturn();
        if (choice === "Submit answers") break;

        const options = params.questions.map((item, index) => {
          const text = answers[index] || "(empty)";
          const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
          return `${index + 1}. ${item.id}: ${preview}`;
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

      const lines = details.answers.map((entry) => `- ${entry.id}: ${entry.answer || "(empty)"}`);
      return { content: [{ type: "text", text: lines.join("\n") }], details };
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
        const tb = result.content.find((b) => b.type === "text");
        return new Text(tb?.type === "text" ? tb.text : "", 0, 0);
      }
      if (details.cancelled) return new Text(theme.fg("warning", "Cancelled"), 0, 0);

      const lines = details.answers.map(
        (e) => theme.fg("success", "✓ ") + theme.fg("accent", e.id) + ": " + (e.answer || theme.fg("dim", "(empty)")),
      );
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
