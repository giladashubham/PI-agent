import { describe, expect, it } from "vitest";
import { resolveSubAgentModel } from "../../tools/web-fetch/model-selection.js";

describe("resolveSubAgentModel", () => {
  it("defaults to openai/gpt-5.4-mini", () => {
    expect(resolveSubAgentModel({}).model).toBe("openai/gpt-5.4-mini");
  });

  it("uses configured model from config", () => {
    expect(resolveSubAgentModel({ model: "openai/gpt-5.4" }).model).toBe("openai/gpt-5.4");
  });

  it("falls back to default when configured model is blank", () => {
    expect(resolveSubAgentModel({ model: "   " }).model).toBe("openai/gpt-5.4-mini");
  });
});
