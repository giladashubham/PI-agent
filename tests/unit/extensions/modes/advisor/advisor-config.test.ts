import { beforeEach, describe, expect, it, vi } from "vitest";
import { readJsonObject } from "../../../../../src/shared/config.js";
import {
  DEFAULT_ADVISOR_MODE_CONFIG,
  loadAdvisorModeConfig,
  normalizeAdvisorModeConfig,
  validateAdvisorModeConfigForEnable,
} from "../../../../../extensions/modes/advisor/advisor-config.js";

vi.mock("../../../../../src/shared/config.js", () => ({
  readJsonObject: vi.fn(),
}));

describe("advisor-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads advisorMode from custom config first", () => {
    vi.mocked(readJsonObject).mockImplementation((path) => {
      if (path.includes("pi-agent-custom.json")) {
        return { advisorMode: { advisorModel: "anthropic/claude-sonnet", toolProfile: "strict" } };
      }
      return { advisorMode: { advisorModel: "openai/gpt-5" } };
    });

    const config = loadAdvisorModeConfig();
    expect(config.advisorModel).toBe("anthropic/claude-sonnet");
    expect(config.toolProfile).toBe("strict");
  });

  it("falls back to settings config when custom config is absent", () => {
    vi.mocked(readJsonObject).mockImplementation((path) => {
      if (path.includes("pi-agent-custom.json")) return undefined;
      return { advisorMode: { advisorModel: "openai/gpt-5" } };
    });

    const config = loadAdvisorModeConfig();
    expect(config.advisorModel).toBe("openai/gpt-5");
    expect(config.toolProfile).toBe(DEFAULT_ADVISOR_MODE_CONFIG.toolProfile);
  });

  it("normalizes invalid values to safe defaults", () => {
    const config = normalizeAdvisorModeConfig({
      thinkingLevel: "invalid",
      toolProfile: "invalid",
      timeoutMs: -1,
      maxAdvisorCallsPerTurn: 0,
      maxAdvisorCallsPerSession: -2,
      maxFiles: 0,
      maxFileBytes: 0,
      maxDraftBytes: 0,
      maxSnippetBytes: 0,
      allowReadOnlyBash: "yes",
    });

    expect(config.thinkingLevel).toBe(DEFAULT_ADVISOR_MODE_CONFIG.thinkingLevel);
    expect(config.toolProfile).toBe(DEFAULT_ADVISOR_MODE_CONFIG.toolProfile);
    expect(config.timeoutMs).toBe(DEFAULT_ADVISOR_MODE_CONFIG.timeoutMs);
    expect(config.maxAdvisorCallsPerTurn).toBe(DEFAULT_ADVISOR_MODE_CONFIG.maxAdvisorCallsPerTurn);
    expect(config.maxAdvisorCallsPerSession).toBe(DEFAULT_ADVISOR_MODE_CONFIG.maxAdvisorCallsPerSession);
    expect(config.maxFiles).toBe(DEFAULT_ADVISOR_MODE_CONFIG.maxFiles);
    expect(config.maxFileBytes).toBe(DEFAULT_ADVISOR_MODE_CONFIG.maxFileBytes);
    expect(config.maxDraftBytes).toBe(DEFAULT_ADVISOR_MODE_CONFIG.maxDraftBytes);
    expect(config.maxSnippetBytes).toBe(DEFAULT_ADVISOR_MODE_CONFIG.maxSnippetBytes);
    expect(config.allowReadOnlyBash).toBe(DEFAULT_ADVISOR_MODE_CONFIG.allowReadOnlyBash);
  });

  it("keeps strict and research profile values when valid", () => {
    expect(normalizeAdvisorModeConfig({ toolProfile: "strict" }).toolProfile).toBe("strict");
    expect(normalizeAdvisorModeConfig({ toolProfile: "research" }).toolProfile).toBe("research");
  });

  it("requires advisorModel for enabling", () => {
    const issues = validateAdvisorModeConfigForEnable(normalizeAdvisorModeConfig({}));
    expect(issues).toContain("advisorMode.advisorModel is required");
  });
});
