interface CacheEntry {
  content: string;
  timestamp: number;
}

export interface WebFetchCache {
  get(url: string): string | null;
  set(url: string, content: string): void;
  cleanup(): void;
  clear(): void;
}

export function createWebFetchCache(ttlMs: number): WebFetchCache {
  const cache = new Map<string, CacheEntry>();

  function get(url: string): string | null {
    const entry = cache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      cache.delete(url);
      return null;
    }
    return entry.content;
  }

  function set(url: string, content: string): void {
    cache.set(url, { content, timestamp: Date.now() });
  }

  function cleanup(): void {
    const now = Date.now();
    for (const [url, entry] of cache) {
      if (now - entry.timestamp > ttlMs) {
        cache.delete(url);
      }
    }
  }

  function clear(): void {
    cache.clear();
  }

  return { get, set, cleanup, clear };
}
