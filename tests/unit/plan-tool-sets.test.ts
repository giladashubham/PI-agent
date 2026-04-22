import { describe, expect, it } from "vitest";
import { getNormalModeToolNames, getPlanModeToolNames, isPlanOnlyTool } from "../../extensions/modes/plan/tool-sets.js";

describe("isPlanOnlyTool", () => {
  it("returns false for all tools in plan-lite mode", () => {
    expect(isPlanOnlyTool("ask_questions")).toBe(false);
    expect(isPlanOnlyTool("read")).toBe(false);
    expect(isPlanOnlyTool("bash")).toBe(false);
  });
});

describe("getNormalModeToolNames", () => {
  it("keeps ask_questions in normal mode", () => {
    expect(getNormalModeToolNames(["read", "ask_questions", "bash", "web_fetch"])).toEqual([
      "read",
      "ask_questions",
      "bash",
      "web_fetch",
    ]);
  });

  it("adds ask_questions when missing", () => {
    expect(getNormalModeToolNames(["read", "bash"]))
      .toEqual(["read", "bash", "ask_questions"]);
  });
});

describe("getPlanModeToolNames", () => {
  it("keeps read-only tools and ask_questions", () => {
    expect(
      getPlanModeToolNames(
        ["read", "bash", "web_fetch", "edit", "ask_questions"],
        ["read", "bash", "edit", "web_fetch"],
      ),
    ).toEqual(["read", "bash", "web_fetch", "ask_questions"]);
  });

  it("does not include ask_questions when unavailable", () => {
    expect(getPlanModeToolNames(["read", "bash"], ["read", "bash", "ask_questions"])).toEqual(["read", "bash"]);
  });
});
