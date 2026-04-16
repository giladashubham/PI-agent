import { describe, expect, it } from "vitest";
import {
  isOpencodeApiKeyConfigured,
  stripOpencodeModelsFromRegistry,
} from "../../extensions/providers/opencode-free-models.js";

describe("isOpencodeApiKeyConfigured", () => {
  it("returns false when key is missing", () => {
    expect(isOpencodeApiKeyConfigured({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("returns true when OPENCODE_API_KEY is set", () => {
    expect(isOpencodeApiKeyConfigured({ OPENCODE_API_KEY: "abc" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("returns true when opencode_API_KEY is set", () => {
    expect(isOpencodeApiKeyConfigured({ opencode_API_KEY: "abc" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("treats blank keys as missing", () => {
    expect(isOpencodeApiKeyConfigured({ OPENCODE_API_KEY: "   " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("stripOpencodeModelsFromRegistry", () => {
  it("removes opencode models from registry", () => {
    const registry = {
      models: [
        { provider: "openai", id: "gpt-5.4-mini" },
        { provider: "opencode", id: "qwen3.6-plus-free" },
        { provider: "anthropic", id: "claude-sonnet" },
        { provider: "opencode", id: "gpt-5-nano" },
      ],
    };

    stripOpencodeModelsFromRegistry(registry);

    expect(registry.models).toEqual([
      { provider: "openai", id: "gpt-5.4-mini" },
      { provider: "anthropic", id: "claude-sonnet" },
    ]);
  });

  it("is a no-op when registry.models is missing", () => {
    const registry = {};
    stripOpencodeModelsFromRegistry(registry as any);
    expect(registry).toEqual({});
  });
});
