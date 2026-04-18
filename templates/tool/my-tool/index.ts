import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * My custom tool.
 *
 * To register: add the path to this file in package.json under pi.extensions
 */
export default function myToolExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Description of what this tool does.",
    parameters: Type.Object({
      input: Type.String({ description: "The input parameter" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      // Your tool logic here
      return {
        content: [{ type: "text", text: "Result: " + params.input }],
      };
    },
  });
}
