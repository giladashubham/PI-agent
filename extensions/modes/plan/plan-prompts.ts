export const PLAN_MODE_PROMPT = `

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

export const CLARIFY_FIRST_PROMPT = `

Current phase: clarification.
For this turn:
1) If the task needs repo context, inspect the codebase with read-only tools.
2) Ask clarifying questions only if still needed.
3) If you use ask_questions and receive answers in this same turn, immediately create the plan now with write_plan.
Do not ask for permission to proceed once clarifications are complete.
`;

export const PLAN_FROM_ANSWERS_PROMPT = `

Current phase: planning.
Use the latest codebase context and the user's clarification answers to produce the full plan now.
Do not ask more clarifying questions in this turn.
Use the write_plan tool to save your plan as a markdown file with a "Plan:" header followed by numbered steps.
`;

export const PLAN_TOOL_WHITELIST = new Set(["read", "bash", "grep", "find", "ls", "web_fetch", "ask_questions", "write_plan"]);
export const NO_CLARIFY_NEEDED_PATTERN = /no clarifying questions needed/i;
