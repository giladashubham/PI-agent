# Extension Template

## Quick Start

1. Copy this directory into the appropriate extensions/ subdirectory:
   - extensions/core/     — session UX (UI, env, status)
   - extensions/modes/    — conversation flow control
   - extensions/policies/ — system prompt behavior
   - extensions/providers/ — model/provider configuration

2. Rename the file and update the export function name

3. Register in package.json:
   "pi": {
     "extensions": [
       "./extensions/<category>/my-extension.ts"
     ]
   }

4. Restart Pi or run /reload

## Available Hooks

- session_start — session initialized
- session_shutdown — session ending
- before_agent_start — before each agent turn (modify system prompt)
- agent_start — agent turn begins
- agent_end — agent turn ends
- tool_call — intercept/block tool calls
- tool_result — observe tool results
- input — user typed something
- model_select — user switched model

## Available APIs

- pi.registerCommand(name, handler) — slash commands
- pi.registerShortcut(key, handler) — keyboard shortcuts
- pi.registerTool(config) — custom tools
- pi.registerProvider(name, config) — model providers
- pi.on(event, handler) — event hooks
- pi.setActiveTools(names) — control available tools
- pi.setModel(model) — switch model
- pi.setThinkingLevel(level) — adjust thinking
- pi.sendMessage(msg) — inject messages
- pi.sendUserMessage(text) — simulate user input
