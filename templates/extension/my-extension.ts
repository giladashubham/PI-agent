import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * My custom extension.
 *
 * To register: add the path to this file in package.json under pi.extensions
 */
export default function myExtension(pi: ExtensionAPI) {
  // Called once on session start
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("my-extension", "loaded");
    }
  });

  // Register a slash command
  pi.registerCommand("mycommand", {
    description: "My custom command",
    handler: async (args, ctx) => {
      ctx.ui.notify("Hello from my extension! Args: " + args, "info");
    },
  });
}
