import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PI_AGENT_DIR } from "./paths.js";

/**
 * Read a JSON file and return it as a plain object, or undefined on failure.
 */
export function readJsonObject(path: string): Record<string, unknown> | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse/IO errors
  }
  return undefined;
}

/**
 * Read a nested key from a JSON config object.
 * Returns undefined if the key path does not exist or is not an object.
 */
export function readConfigSection(config: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!config) return undefined;
  const value = config[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Write a JSON object to disk (best effort).
 * Creates the PI_AGENT_DIR if needed.
 */
export function writeJsonConfig(path: string, config: Record<string, unknown>): void {
  try {
    mkdirSync(PI_AGENT_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
  } catch {
    // best effort only
  }
}

/**
 * Resolve a config value by checking multiple sources in order.
 * Returns the first truthy result from the resolvers.
 */
export function resolveConfig<T>(resolvers: Array<() => T | undefined>): T | undefined {
  for (const resolver of resolvers) {
    const result = resolver();
    if (result !== undefined) return result;
  }
  return undefined;
}
