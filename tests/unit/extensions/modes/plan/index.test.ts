import { describe, expect, it, vi } from "vitest";
import planModeExtension from "../../../../../extensions/modes/plan/index.js";

type EventHandler = (...args: any[]) => any;

function createMockPi() {
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  const events: Record<string, EventHandler[]> = {};
  const sentUserMessages: string[] = [];
  const setActiveToolsCalls: string[][] = [];

  const allTools = ["read", "bash", "edit", "web_fetch", "ask_questions"];
  let activeTools = [...allTools];

  const pi = {
    registerTool: vi.fn(),
    registerCommand: vi.fn((name: string, config: { handler: (args: string, ctx: any) => Promise<void> }) => {
      commands.set(name, config);
    }),
    registerShortcut: vi.fn(),
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!events[event]) events[event] = [];
      events[event].push(handler);
    }),
    events: {
      on: vi.fn(),
      emit: vi.fn(),
    },
    appendEntry: vi.fn(),
    getAllTools: vi.fn(() => allTools.map((name) => ({ name }))),
    getActiveTools: vi.fn(() => [...activeTools]),
    setActiveTools: vi.fn((names: string[]) => {
      activeTools = [...names];
      setActiveToolsCalls.push([...names]);
    }),
    sendUserMessage: vi.fn((message: string) => {
      sentUserMessages.push(message);
    }),
    getThinkingLevel: vi.fn(() => "off"),
    setThinkingLevel: vi.fn(),
    setModel: vi.fn(async () => true),
  };

  const ctx = {
    hasUI: false,
    model: { provider: "openai-codex", id: "gpt-5.4" },
    modelRegistry: {
      find: vi.fn(() => ({ provider: "openai-codex", id: "gpt-5.4" })),
      getAll: vi.fn(() => [{ provider: "openai-codex", id: "gpt-5.4" }]),
    },
    sessionManager: {
      getEntries: vi.fn(() => []),
    },
    ui: {
      setStatus: vi.fn(),
      notify: vi.fn(),
    },
  };

  return {
    pi,
    ctx,
    commands,
    events,
    sentUserMessages,
    setActiveToolsCalls,
    get activeTools() {
      return [...activeTools];
    },
  };
}

describe("plan mode extension", () => {
  it("treats unknown /plan argument as task input (no /plan status subcommand)", async () => {
    const mock = createMockPi();
    planModeExtension(mock.pi as any);

    const command = mock.commands.get("plan");
    expect(command).toBeTruthy();

    await command!.handler("status", mock.ctx as any);

    expect(mock.sentUserMessages).toEqual(["status"]);
    expect(mock.activeTools).toContain("ask_questions");
    expect(mock.activeTools).not.toContain("edit");
  });

  it("/plan off restores normal tool access", async () => {
    const mock = createMockPi();
    planModeExtension(mock.pi as any);

    const command = mock.commands.get("plan");
    await command!.handler("on", mock.ctx as any);
    expect(mock.activeTools).not.toContain("edit");

    await command!.handler("off", mock.ctx as any);
    expect(mock.activeTools).toContain("edit");
  });

  it("blocks unsafe bash commands while plan mode is enabled", async () => {
    const mock = createMockPi();
    planModeExtension(mock.pi as any);

    const command = mock.commands.get("plan");
    await command!.handler("on", mock.ctx as any);

    const toolCallHandlers = mock.events["tool_call"] ?? [];
    expect(toolCallHandlers.length).toBeGreaterThan(0);

    const unsafeResult = await toolCallHandlers[0]({ toolName: "bash", input: { command: "rm -rf /" } });
    expect(unsafeResult?.block).toBe(true);

    const safeResult = await toolCallHandlers[0]({ toolName: "bash", input: { command: "ls -la" } });
    expect(safeResult).toBeUndefined();
  });
});
