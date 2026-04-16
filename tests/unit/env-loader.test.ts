import { describe, expect, it } from "vitest";
import { applyEnvVars, parseDotEnv } from "../../extensions/core/env-loader.js";

describe("parseDotEnv", () => {
  it("parses basic key/value pairs", () => {
    const parsed = parseDotEnv("A=1\nB=two\n");
    expect(parsed.vars).toEqual({ A: "1", B: "two" });
    expect(parsed.invalidLines).toBe(0);
  });

  it("supports export, comments, quotes, and counts invalid lines", () => {
    const parsed = parseDotEnv([
      "# comment",
      "export API_KEY=abc123",
      "TEXT=hello # inline comment",
      "DOUBLE=\"line1\\nline2\"",
      "SINGLE='  keep spaces  '",
      "bad-line",
      "1BAD=value",
    ].join("\n"));

    expect(parsed.vars).toEqual({
      API_KEY: "abc123",
      TEXT: "hello",
      DOUBLE: "line1\nline2",
      SINGLE: "  keep spaces  ",
    });
    expect(parsed.invalidLines).toBe(2);
  });
});

describe("applyEnvVars", () => {
  it("does not overwrite existing variables by default", () => {
    const key = "PI_ENV_LOADER_TEST_KEY";
    const previous = process.env[key];

    process.env[key] = "from-shell";
    const result = applyEnvVars({ [key]: "from-dotenv" });

    expect(result).toEqual({ applied: 0, skipped: 1 });
    expect(process.env[key]).toBe("from-shell");

    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });

  it("can overwrite existing variables when overrideExisting is true", () => {
    const key = "PI_ENV_LOADER_TEST_KEY";
    const previous = process.env[key];

    process.env[key] = "from-shell";
    const result = applyEnvVars({ [key]: "from-dotenv" }, { overrideExisting: true });

    expect(result).toEqual({ applied: 1, skipped: 0 });
    expect(process.env[key]).toBe("from-dotenv");

    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });

  it("does not overwrite preserved keys even when overrideExisting is true", () => {
    const key = "PI_ENV_LOADER_SHELL_KEY";
    const previous = process.env[key];

    process.env[key] = "from-shell";
    const result = applyEnvVars(
      { [key]: "from-dotenv" },
      { overrideExisting: true, preserveKeys: new Set([key]) },
    );

    expect(result).toEqual({ applied: 0, skipped: 1 });
    expect(process.env[key]).toBe("from-shell");

    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
});
