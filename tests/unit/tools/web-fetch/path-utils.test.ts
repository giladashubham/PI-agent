import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandHomePath } from "../../../../tools/web-fetch/util/path-utils.js";

describe("expandHomePath", () => {
  it("expands ~ to home directory", () => {
    expect(expandHomePath("~")).toBe(homedir());
  });

  it("expands ~/... to absolute path", () => {
    expect(expandHomePath("~/abc/def")).toBe(join(homedir(), "abc/def"));
  });

  it("keeps non-home paths unchanged", () => {
    expect(expandHomePath("/tmp/abc")).toBe("/tmp/abc");
    expect(expandHomePath("relative/path")).toBe("relative/path");
  });
});
