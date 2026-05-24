import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";

const {
  loadAdvisorModeConfigMock,
  validateAdvisorModeConfigForEnableMock,
  runAdvisorSubagentMock,
  readJsonObjectMock,
  writeJsonConfigMock,
} = vi.hoisted(() => ({
  loadAdvisorModeConfigMock: vi.fn(),
  validateAdvisorModeConfigForEnableMock: vi.fn(),
  runAdvisorSubagentMock: vi.fn(),
  readJsonObjectMock: vi.fn(),
  writeJsonConfigMock: vi.fn(),
}));

vi.mock("../../../../../extensions/modes/advisor/advisor-config.js", () => ({
  loadAdvisorModeConfig: loadAdvisorModeConfigMock,
  validateAdvisorModeConfigForEnable: validateAdvisorModeConfigForEnableMock,
}));

vi.mock("../../../../../extensions/modes/advisor/advisor-subagent.js", () => ({
  runAdvisorSubagent: runAdvisorSubagentMock,
}));

vi.mock("../../../../../src/shared/config.js", () => ({
  readJsonObject: readJsonObjectMock,
  writeJsonConfig: writeJsonConfigMock,
}));

import advisorModeExtension from "../../../../../extensions/modes/advisor/index.js";

interface MockUI {
  setStatus: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
}

interface MockHarness {
  pi: ExtensionAPI;
  commands: Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>;
  tools: Map<string, { execute: (...args: any[]) => Promise<any> }>;
  handlers: Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<unknown>>>;
  appendEntry: ReturnType<typeof vi.fn>;
  sendUserMessage: ReturnType<typeof vi.fn>;
}

function createMockContext(overrides: Partial<ExtensionCommandContext> = {}): ExtensionCommandContext {
  const ui: MockUI = {
    setStatus: vi.fn(),
    notify: vi.fn(),
  };

  return {
    ui: ui as unknown as ExtensionContext["ui"],
    hasUI: true,
    cwd: process.cwd(),
    sessionManager: { getEntries: vi.fn(() => []) } as unknown as ExtensionContext["sessionManager"],
    modelRegistry: { getAll: vi.fn(() => []), find: vi.fn() } as unknown as ExtensionContext["modelRegistry"],
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort: vi.fn(),
    hasPendingMessages: () => false,
    shutdown: vi.fn(),
    getContextUsage: () => undefined,
    compact: vi.fn(),
    getSystemPrompt: () => "",
    waitForIdle: async () => {},
    newSession: async () => ({ cancelled: false }),
    fork: async () => ({ cancelled: false }),
    navigateTree: async () => ({ cancelled: false }),
    switchSession: async () => ({ cancelled: false }),
    reload: async () => {},
    ...overrides,
  };
}

function createHarness(): MockHarness {
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
  const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
  const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<unknown>>>();

  const appendEntry = vi.fn();
  const sendUserMessage = vi.fn();

  const pi = {
    registerCommand: vi.fn((name, options) => {
      commands.set(name, options as { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> });
    }),
    registerTool: vi.fn((tool) => {
      tools.set(tool.name, tool as { execute: (...args: any[]) => Promise<any> });
    }),
    on: vi.fn((event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler as (event: unknown, ctx: ExtensionContext) => Promise<unknown>);
      handlers.set(event, list);
    }),
    appendEntry,
    sendUserMessage,
  } as unknown as ExtensionAPI;

  return { pi, commands, tools, handlers, appendEntry, sendUserMessage };
}

function defaultAdvisorConfig() {
  return {
    enabled: false,
    advisorModel: "anthropic/claude-sonnet",
    thinkingLevel: "high",
    toolProfile: "research",
    timeoutMs: 60_000,
    maxAdvisorCallsPerTurn: 1,
    maxAdvisorCallsPerSession: 2,
    maxFiles: 3,
    maxFileBytes: 12_000,
    maxDraftBytes: 16_000,
    maxSnippetBytes: 8_000,
    allowReadOnlyBash: false,
    autoSuggest: true,
    triggers: { architecture: true, migration: true, security: true, riskyRefactor: false },
  };
}

async function runEvent(
  harness: MockHarness,
  eventName: string,
  event: unknown,
  ctx: ExtensionContext,
): Promise<Array<unknown>> {
  const handlers = harness.handlers.get(eventName) ?? [];
  const results: Array<unknown> = [];
  for (const handler of handlers) {
    results.push(await handler(event, ctx));
  }
  return results;
}

describe("advisor mode extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAdvisorModeConfigMock.mockReturnValue(defaultAdvisorConfig());
    validateAdvisorModeConfigForEnableMock.mockReturnValue([]);
    runAdvisorSubagentMock.mockResolvedValue({ ok: true, response: "advisor-response" });
    readJsonObjectMock.mockReturnValue({});
    writeJsonConfigMock.mockReturnValue(undefined);
  });

  it("supports /advisor on and /advisor off", async () => {
    const harness = createHarness();
    advisorModeExtension(harness.pi);

    const ctx = createMockContext();
    const command = harness.commands.get("advisor");
    expect(command).toBeDefined();

    await command!.handler("on", ctx);
    expect(harness.appendEntry).toHaveBeenCalledWith(
      "advisor-mode-state",
      expect.objectContaining({
        enabled: true,
        advisorCallsThisSession: 0,
      }),
    );

    await command!.handler("off", ctx);
    expect(harness.appendEntry).toHaveBeenCalledWith(
      "advisor-mode-state",
      expect.objectContaining({
        enabled: false,
        advisorCallsThisSession: 0,
      }),
    );
  });

  it("injects advisor prompt only when enabled", async () => {
    const harness = createHarness();
    advisorModeExtension(harness.pi);

    const ctx = createMockContext();
    const command = harness.commands.get("advisor")!;

    const beforeEnable = await runEvent(
      harness,
      "before_agent_start",
      { systemPrompt: "base", prompt: "x" },
      ctx,
    );
    expect(beforeEnable[0]).toEqual({});

    await command.handler("on", ctx);

    const afterEnable = await runEvent(
      harness,
      "before_agent_start",
      { systemPrompt: "base", prompt: "x" },
      ctx,
    );

    const eventResult = afterEnable[0] as { systemPrompt?: string };
    expect(eventResult.systemPrompt).toContain("Advisor mode is enabled.");
  });

  it("restores persisted mode state on session start", async () => {
    const harness = createHarness();
    advisorModeExtension(harness.pi);

    const ctx = createMockContext({
      sessionManager: {
        getEntries: vi.fn(() => [
          {
            type: "custom",
            customType: "advisor-mode-state",
            data: { enabled: true, advisorCallsThisSession: 3 },
          },
        ]),
      } as unknown as ExtensionContext["sessionManager"],
    });

    await runEvent(harness, "session_start", { type: "session_start" }, ctx);

    const beforeAgentResults = await runEvent(
      harness,
      "before_agent_start",
      { systemPrompt: "base", prompt: "x" },
      ctx,
    );

    const result = beforeAgentResults[0] as { systemPrompt?: string };
    expect(result.systemPrompt).toContain("Advisor mode is enabled.");
  });

  it("supports /advisor model <provider/model-id> and uses override in advisor calls", async () => {
    const harness = createHarness();
    advisorModeExtension(harness.pi);

    loadAdvisorModeConfigMock.mockReturnValue({
      ...defaultAdvisorConfig(),
      advisorModel: "openai/gpt-5",
    });

    const ctx = createMockContext({
      model: { provider: "anthropic", id: "claude-sonnet" } as unknown as ExtensionContext["model"],
      modelRegistry: {
        getAll: vi.fn(() => [
          { provider: "openai", id: "gpt-5", name: "GPT-5" },
          { provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet" },
        ]),
        find: vi.fn((provider: string, id: string) => {
          if (provider === "anthropic" && id === "claude-sonnet") {
            return { provider, id, name: "Claude Sonnet" };
          }
          if (provider === "openai" && id === "gpt-5") {
            return { provider, id, name: "GPT-5" };
          }
          return undefined;
        }),
      } as unknown as ExtensionContext["modelRegistry"],
    });

    const command = harness.commands.get("advisor")!;
    const consultTool = harness.tools.get("consult_advisor")!;

    await command.handler("model anthropic/claude-sonnet", ctx);
    expect(writeJsonConfigMock).toHaveBeenCalled();

    await command.handler("on", ctx);
    await consultTool.execute("call-1", { objective: "Review" }, undefined, undefined, ctx);

    expect(runAdvisorSubagentMock).toHaveBeenCalledWith(
      expect.objectContaining({ advisorModel: "anthropic/claude-sonnet" }),
    );
  });

  it("enforces per-turn and per-session advisor budgets", async () => {
    const harness = createHarness();
    advisorModeExtension(harness.pi);

    const ctx = createMockContext();
    const command = harness.commands.get("advisor")!;
    const consultTool = harness.tools.get("consult_advisor");
    expect(consultTool).toBeDefined();

    await command.handler("on", ctx);

    const first = await consultTool!.execute(
      "call-1",
      { objective: "Review plan" },
      undefined,
      undefined,
      ctx,
    );
    expect(first.content[0].text).toContain("advisor-response");

    const second = await consultTool!.execute(
      "call-2",
      { objective: "Review again" },
      undefined,
      undefined,
      ctx,
    );
    expect(second.content[0].text).toContain("maxAdvisorCallsPerTurn");

    await runEvent(harness, "turn_start", { type: "turn_start", turnIndex: 1, timestamp: Date.now() }, ctx);

    const third = await consultTool!.execute(
      "call-3",
      { objective: "Third review" },
      undefined,
      undefined,
      ctx,
    );
    expect(third.content[0].text).toContain("advisor-response");

    await runEvent(harness, "turn_start", { type: "turn_start", turnIndex: 2, timestamp: Date.now() }, ctx);

    const fourth = await consultTool!.execute(
      "call-4",
      { objective: "Fourth review" },
      undefined,
      undefined,
      ctx,
    );
    expect(fourth.content[0].text).toContain("maxAdvisorCallsPerSession");
  });
});
