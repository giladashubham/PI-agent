import type { AdvisorModeConfig } from "./advisor-config.js";
import { renderAdvisorToolPolicy } from "./advisor-tool-policy.js";

export function buildPrimaryAdvisorModePrompt(config: AdvisorModeConfig): string {
  return `

Advisor mode is enabled.
Call consult_advisor only for high-value checks (architecture, migrations, risk/security review, correctness).
Use it sparingly.
Current advisor profile: ${config.toolProfile} (${renderAdvisorToolPolicy(config.toolProfile, { allowReadOnlyBash: config.allowReadOnlyBash })})
Do not call advisor for trivial lookups or routine edits.
`;
}

export function buildAdvisorRolePrompt(config: AdvisorModeConfig): string {
  const lines = [
    "You are an advisor model supporting a primary coding agent.",
    "Your role is evaluator/reviewer: critique, de-risk, and improve decisions.",
    "Never claim to have edited files.",
    "Prefer concise, actionable output with risks, tradeoffs, and next step.",
    renderAdvisorToolPolicy(config.toolProfile, { allowReadOnlyBash: config.allowReadOnlyBash }),
  ];

  if (config.toolProfile === "research") {
    lines.push("You may gather missing evidence using available read-only tools and web_fetch.");
    lines.push("Keep calls minimal and prefer targeted reads over broad scans.");
  } else {
    lines.push("You have no tools. Base your response only on the provided payload.");
  }

  return lines.join("\n");
}
