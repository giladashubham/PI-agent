import { describe, expect, it } from "vitest";
import {
  isOpencodeGoApiKeyConfigured,
  stripOpencodeGoModelsFromRegistry,
} from "../../extensions/providers/opencode-go-models.js";

describe("isOpencodeGoApiKeyConfigured", () => {
  it("returns false when key is missing", () => {
    expect(isOpencodeGoApiKeyConfigured({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("returns true when OPENCODE_GO_API_KEY is set", () => {
    expect(isOpencodeGoApiKeyConfigured({ OPENCODE_GO_API_KEY: "abc" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("returns true when opencode_go_API_KEY is set", () => {
    expect(isOpencodeGoApiKeyConfigured({ opencode_go_API_KEY: "abc" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("treats blank keys as missing", () => {
    expect(isOpencodeGoApiKeyConfigured({ OPENCODE_GO_API_KEY: "   " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("stripOpencodeGoModelsFromRegistry", () => {
  it("removes opencode-go models from registry", () => {
    const registry = {
      models: [
        { provider: "openai", id: "gpt-5.4-mini" },
        { provider: "opencode-go", id: "kimi-k2.5" },
        { provider: "anthropic", id: "claude-sonnet" },
        { provider: "opencode-go", id: "gemini-2.5-pro" },
      ],
    };

    stripOpencodeGoModelsFromRegistry(registry);

    expect(registry.models).toEqual([
      { provider: "openai", id: "gpt-5.4-mini" },
      { provider: "anthropic", id: "claude-sonnet" },
    ]);
  });

  it("is a no-op when registry.models is missing", () => {
    const registry = {};
    stripOpencodeGoModelsFromRegistry(registry as any);
    expect(registry).toEqual({});
  });
});
