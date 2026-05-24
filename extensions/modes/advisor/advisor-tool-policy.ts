export type AdvisorToolProfile = "strict" | "research";

const RESEARCH_BUILTIN_TOOLS: string[] = ["read", "grep", "find", "ls"];
const RESEARCH_EXTENSION_TOOLS: string[] = ["web_fetch"];

export function normalizeAdvisorToolProfile(value: string | undefined): AdvisorToolProfile | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "strict" || normalized === "research") return normalized;
  return undefined;
}

export function getAdvisorBuiltinTools(
  profile: AdvisorToolProfile,
  options?: { allowReadOnlyBash?: boolean },
): string[] {
  if (profile === "strict") return [];

  const tools = [...RESEARCH_BUILTIN_TOOLS];
  if (options?.allowReadOnlyBash && !tools.includes("bash")) {
    tools.push("bash");
  }

  return tools;
}

export function getAdvisorAllowedTools(
  profile: AdvisorToolProfile,
  options?: { allowReadOnlyBash?: boolean },
): string[] {
  if (profile === "strict") return [];
  return [...getAdvisorBuiltinTools(profile, options), ...RESEARCH_EXTENSION_TOOLS];
}

export function renderAdvisorToolPolicy(
  profile: AdvisorToolProfile,
  options?: { allowReadOnlyBash?: boolean },
): string {
  if (profile === "strict") {
    return "Advisor tools: none (strict profile). Use only provided payload.";
  }

  const tools = getAdvisorAllowedTools(profile, options);
  return `Advisor tools: ${tools.join(", ")} (read-only repo research plus optional web research).`;
}
