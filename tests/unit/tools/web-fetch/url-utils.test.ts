import { describe, expect, it } from "vitest";
import { validateAndNormalizeUrl } from "../../../../tools/web-fetch/util/url-utils.js";

describe("validateAndNormalizeUrl", () => {
  it("normalizes http to https", () => {
    const result = validateAndNormalizeUrl("http://example.com/path");
    expect(result).toEqual({ url: "https://example.com/path" });
  });

  it("strips leading @", () => {
    const result = validateAndNormalizeUrl("@https://example.com");
    expect(result).toEqual({ url: "https://example.com/" });
  });

  it("rejects unsupported schemes", () => {
    const result = validateAndNormalizeUrl("ftp://example.com");
    expect(result.error).toContain("Unsupported URL scheme");
  });

  it("rejects invalid URLs", () => {
    const result = validateAndNormalizeUrl("not-a-url");
    expect(result.error).toContain("Invalid URL");
  });
});
