import { describe, it, expect, vi, beforeEach } from "vitest";
import { readJsonObject, readConfigSection, resolveConfig } from "../../../src/shared/config.js";
import { existsSync, readFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe("readJsonObject", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns undefined for non-existent file", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readJsonObject("/fake/path.json")).toBeUndefined();
  });

  it("parses valid JSON object", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"key": "value"}');
    const result = readJsonObject("/fake/path.json");
    expect(result).toEqual({ key: "value" });
  });

  it("returns undefined for array JSON", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('[1, 2, 3]');
    expect(readJsonObject("/fake/path.json")).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json');
    expect(readJsonObject("/fake/path.json")).toBeUndefined();
  });
});

describe("readConfigSection", () => {
  it("returns undefined for undefined config", () => {
    expect(readConfigSection(undefined, "key")).toBeUndefined();
  });

  it("returns undefined for missing key", () => {
    expect(readConfigSection({ other: "val" }, "key")).toBeUndefined();
  });

  it("returns undefined for non-object value", () => {
    expect(readConfigSection({ key: "string" }, "key")).toBeUndefined();
  });

  it("returns object section", () => {
    const config = { ui: { theme: "dark", banner: true } };
    expect(readConfigSection(config, "ui")).toEqual({ theme: "dark", banner: true });
  });
});

describe("resolveConfig", () => {
  it("returns first defined value", () => {
    const result = resolveConfig([
      () => undefined,
      () => "found",
      () => "second",
    ]);
    expect(result).toBe("found");
  });

  it("returns undefined when all resolvers return undefined", () => {
    const result = resolveConfig([
      () => undefined,
      () => undefined,
    ]);
    expect(result).toBeUndefined();
  });
});
