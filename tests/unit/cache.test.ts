import { describe, expect, it, vi } from "vitest";
import { createWebFetchCache } from "../../tools/web-fetch/cache.js";

describe("createWebFetchCache", () => {
  it("stores and retrieves content before TTL", () => {
    const cache = createWebFetchCache(1000);
    cache.set("https://a.example", "hello");
    expect(cache.get("https://a.example")).toBe("hello");
  });

  it("expires entries past TTL", () => {
    vi.useFakeTimers();
    try {
      const cache = createWebFetchCache(1000);
      cache.set("https://a.example", "hello");
      vi.advanceTimersByTime(1001);
      expect(cache.get("https://a.example")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleanup removes expired entries", () => {
    vi.useFakeTimers();
    try {
      const cache = createWebFetchCache(1000);
      cache.set("https://a.example", "a");
      cache.set("https://b.example", "b");
      vi.advanceTimersByTime(1001);
      cache.cleanup();
      expect(cache.get("https://a.example")).toBeNull();
      expect(cache.get("https://b.example")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
