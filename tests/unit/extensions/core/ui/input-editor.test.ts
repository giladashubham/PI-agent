import { describe, expect, it } from "vitest";
import { isEditorBorderLine, stripTerminalCodes } from "../../../../../extensions/core/ui/input-editor.js";

describe("stripTerminalCodes", () => {
  it("removes ANSI color sequences", () => {
    expect(stripTerminalCodes("\x1b[38;2;255;0;0mhello\x1b[0m")).toBe("hello");
  });
});

describe("isEditorBorderLine", () => {
  it("detects colored horizontal editor borders", () => {
    const line = "\x1b[38;2;248;81;73m──────────\x1b[0m";
    expect(isEditorBorderLine(line)).toBe(true);
  });

  it("does not treat normal content as a border", () => {
    expect(isEditorBorderLine(" /hello")).toBe(false);
  });
});
