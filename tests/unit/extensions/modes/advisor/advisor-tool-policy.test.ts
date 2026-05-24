import { describe, expect, it } from "vitest";
import {
  getAdvisorAllowedTools,
  getAdvisorBuiltinTools,
  normalizeAdvisorToolProfile,
} from "../../../../../extensions/modes/advisor/advisor-tool-policy.js";

describe("advisor-tool-policy", () => {
  it("normalizes profile values", () => {
    expect(normalizeAdvisorToolProfile("strict")).toBe("strict");
    expect(normalizeAdvisorToolProfile("research")).toBe("research");
    expect(normalizeAdvisorToolProfile(" RESEARCH ")).toBe("research");
    expect(normalizeAdvisorToolProfile("unknown")).toBeUndefined();
  });

  it("returns no tools for strict profile", () => {
    expect(getAdvisorBuiltinTools("strict")).toEqual([]);
    expect(getAdvisorAllowedTools("strict")).toEqual([]);
  });

  it("returns research tools and web_fetch", () => {
    expect(getAdvisorBuiltinTools("research")).toEqual(["read", "grep", "find", "ls"]);
    expect(getAdvisorAllowedTools("research")).toEqual(["read", "grep", "find", "ls", "web_fetch"]);
  });

  it("optionally includes read-only bash in research profile", () => {
    expect(getAdvisorBuiltinTools("research", { allowReadOnlyBash: true })).toEqual(["read", "grep", "find", "ls", "bash"]);
    expect(getAdvisorAllowedTools("research", { allowReadOnlyBash: true })).toEqual([
      "read",
      "grep",
      "find",
      "ls",
      "bash",
      "web_fetch",
    ]);
  });
});
