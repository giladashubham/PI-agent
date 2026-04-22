import { describe, expect, it } from "vitest";
import { ExtensionRegistry, matchExtension } from "../../../../tools/web-fetch/core/registry.js";
import type { WebFetchExtension } from "../../../../tools/web-fetch/types.js";

describe("matchExtension", () => {
  it("returns null for invalid URLs", () => {
    expect(matchExtension("not-a-url", [])).toBeNull();
  });

  it("matches host + pathname with glob patterns", () => {
    const ext: WebFetchExtension = {
      name: "docs",
      matches: ["example.com/docs/**"],
    };
    expect(matchExtension("https://example.com/docs/intro", [ext])?.name).toBe("docs");
    expect(matchExtension("https://example.com/blog/post", [ext])).toBeNull();
  });
});

describe("ExtensionRegistry", () => {
  const builtIn: WebFetchExtension = { name: "builtin", matches: ["example.com/**"] };
  const local: WebFetchExtension = { name: "local", matches: ["example.com/**"] };
  const bus: WebFetchExtension = { name: "bus", matches: ["example.com/**"] };

  it("matches in priority order: event-bus -> local -> built-in", () => {
    const registry = new ExtensionRegistry();
    registry.addBuiltIn(builtIn);
    registry.addLocal(local);
    registry.addEventBus(bus);

    expect(registry.match("https://example.com/path")?.name).toBe("bus");
  });

  it("reports source counts", () => {
    const registry = new ExtensionRegistry();
    registry.addBuiltIn(builtIn);
    registry.addLocal(local);

    expect(registry.count).toBe(2);
    expect(registry.counts).toEqual({ eventBus: 0, local: 1, builtIn: 1 });
  });
});
