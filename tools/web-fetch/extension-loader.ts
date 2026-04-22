import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { WebFetchExtension } from "./types.js";
import type { ExtensionRegistry } from "./core/registry.js";

export type NotifyFn = (message: string, level: "info" | "warning" | "error") => void;

export async function loadBuiltInExtensions(registry: ExtensionRegistry, notify: NotifyFn): Promise<void> {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const extensionsDir = join(thisDir, "extensions");
  if (!existsSync(extensionsDir)) return;

  const files = readdirSync(extensionsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of files) {
    try {
      const modulePath = join(extensionsDir, file);
      const mod = await import(modulePath);
      const factory = mod.default;
      if (typeof factory !== "function") {
        notify(`web-fetch: built-in extension ${file} has no default export function, skipping`, "warning");
        continue;
      }
      const ext: WebFetchExtension = factory();
      if (!ext.name || !ext.matches) {
        notify(`web-fetch: built-in extension ${file} missing name or matches, skipping`, "warning");
        continue;
      }
      registry.addBuiltIn(ext);
    } catch (err: any) {
      notify(`web-fetch: failed to load built-in extension ${file}: ${err.message}`, "error");
    }
  }
}

export async function loadLocalExtensions(
  registry: ExtensionRegistry,
  extensionsDir: string,
  notify: NotifyFn,
): Promise<void> {
  if (!existsSync(extensionsDir)) return;

  const files = readdirSync(extensionsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of files) {
    try {
      const modulePath = join(extensionsDir, file);
      const mod = await import(modulePath);
      const factory = mod.default;
      if (typeof factory !== "function") {
        notify(`web-fetch: local extension ${file} has no default export function, skipping`, "warning");
        continue;
      }
      const ext: WebFetchExtension = factory();
      if (!ext.name || !ext.matches) {
        notify(`web-fetch: local extension ${file} missing name or matches, skipping`, "warning");
        continue;
      }
      registry.addLocal(ext);
    } catch (err: any) {
      notify(`web-fetch: failed to load local extension ${file}: ${err.message}`, "error");
    }
  }
}

export function setupEventBusRegistration(pi: ExtensionAPI, registry: ExtensionRegistry): void {
  pi.events.on("web-fetch:register", (data: unknown) => {
    const ext = data as WebFetchExtension;
    if (!ext || typeof ext !== "object") {
      console.error("web-fetch: received invalid registration on web-fetch:register (not an object)");
      return;
    }
    if (!ext.name || !ext.matches || !Array.isArray(ext.matches)) {
      console.error("web-fetch: received registration missing required fields (name, matches)");
      return;
    }
    registry.addEventBus(ext);
  });
}
