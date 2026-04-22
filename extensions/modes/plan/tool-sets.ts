import { PLAN_TOOL_WHITELIST } from "./plan-prompts.js";

/**
 * Reserved for future expansion.
 * In the current plan-lite flow, no tool is exclusive to /plan mode.
 */
const PLAN_ONLY_TOOLS = new Set<string>();

/**
 * Tools that should be available even outside plan mode.
 */
const ALWAYS_ON_TOOLS = ["ask_questions"];

export function isPlanOnlyTool(toolName: string): boolean {
  return PLAN_ONLY_TOOLS.has(toolName);
}

function ensureAlwaysOnTools(toolNames: string[]): string[] {
  const result = [...toolNames];
  for (const toolName of ALWAYS_ON_TOOLS) {
    if (!result.includes(toolName)) {
      result.push(toolName);
    }
  }
  return result;
}

export function getNormalModeToolNames(toolNames: string[]): string[] {
  return ensureAlwaysOnTools(toolNames.filter((name) => !isPlanOnlyTool(name)));
}

export function getPlanModeToolNames(availableToolNames: string[], previousTools: string[]): string[] {
  const available = new Set(availableToolNames);
  const result = getNormalModeToolNames(previousTools).filter((name) => PLAN_TOOL_WHITELIST.has(name) && available.has(name));

  for (const toolName of ALWAYS_ON_TOOLS) {
    if (available.has(toolName) && !result.includes(toolName)) {
      result.push(toolName);
    }
  }

  return result;
}
