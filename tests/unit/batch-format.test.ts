import { describe, expect, it } from "vitest";
import { formatBatchResults } from "../../tools/web-fetch/batch-format.js";

describe("formatBatchResults", () => {
  it("returns single-page result directly", () => {
    const result = formatBatchResults(
      [{ url: "https://a.example" }],
      [
        {
          status: "fulfilled",
          value: { content: [{ type: "text", text: "ok" }] },
        },
      ],
    );

    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("formats multi-page results with headers", () => {
    const result = formatBatchResults(
      [{ url: "https://a.example" }, { url: "https://b.example" }],
      [
        {
          status: "fulfilled",
          value: { content: [{ type: "text", text: "alpha" }] },
        },
        {
          status: "fulfilled",
          value: { isError: true, content: [{ type: "text", text: "bad" }] },
        },
      ],
    );

    const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("--- [1/2] https://a.example ---");
    expect(text).toContain("alpha");
    expect(text).toContain("--- [2/2] https://b.example ---");
    expect(text).toContain("Error: bad");
  });

  it("marks single-page rejection as isError", () => {
    const result = formatBatchResults(
      [{ url: "https://a.example" }],
      [{ status: "rejected", reason: new Error("boom") }],
    );
    expect(result.isError).toBe(true);
    expect(result.content?.[0]).toEqual({ type: "text", text: "Error: boom" });
  });
});
