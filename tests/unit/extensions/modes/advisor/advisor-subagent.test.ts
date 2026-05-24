import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { buildAdvisorSubagentArgs, runAdvisorSubagent } from "../../../../../extensions/modes/advisor/advisor-subagent.js";

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill = vi.fn((_signal?: string) => {
    this.killed = true;
    setTimeout(() => {
      this.emit("close", 143);
    }, 0);
    return true;
  });
}

function defaultOptions(overrides: Partial<Parameters<typeof runAdvisorSubagent>[0]> = {}): Parameters<typeof runAdvisorSubagent>[0] {
  return {
    cwd: process.cwd(),
    prompt: "hello",
    advisorModel: "anthropic/claude-sonnet",
    thinkingLevel: "high",
    toolProfile: "research",
    allowReadOnlyBash: false,
    timeoutMs: 1000,
    ...overrides,
  };
}

describe("advisor-subagent", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("builds strict profile args with no tools and no extensions", () => {
    const args = buildAdvisorSubagentArgs({
      prompt: "prompt",
      advisorModel: "anthropic/claude-sonnet",
      thinkingLevel: "high",
      toolProfile: "strict",
      allowReadOnlyBash: false,
    });

    expect(args).toContain("--no-tools");
    expect(args).toContain("--no-extensions");
    expect(args).toContain("--model");
    expect(args).toContain("anthropic/claude-sonnet");
  });

  it("builds research profile args with read-only tools and web_fetch extension", () => {
    const args = buildAdvisorSubagentArgs({
      prompt: "prompt",
      advisorModel: "anthropic/claude-sonnet",
      thinkingLevel: "high",
      toolProfile: "research",
      allowReadOnlyBash: false,
    });

    expect(args).toContain("--tools");
    expect(args).toContain("read,grep,find,ls");
    expect(args).toContain("--no-extensions");
    expect(args).toContain("-e");
  });

  it("returns timeout error when subprocess exceeds timeout", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawnMock>);

    const result = await runAdvisorSubagent(defaultOptions({ timeoutMs: 5 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("timed out");
    }
    expect(child.kill).toHaveBeenCalled();
  });

  it("returns non-zero exit fallback", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawnMock>);

    setTimeout(() => {
      child.stderr.emit("data", Buffer.from("boom"));
      child.emit("close", 1);
    }, 0);

    const result = await runAdvisorSubagent(defaultOptions());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("exit code 1");
      expect(result.error).toContain("boom");
    }
  });

  it("returns empty response fallback when no assistant message is produced", async () => {
    const child = new FakeChildProcess();
    spawnMock.mockReturnValue(child as unknown as ReturnType<typeof spawnMock>);

    setTimeout(() => {
      child.emit("close", 0);
    }, 0);

    const result = await runAdvisorSubagent(defaultOptions());
    expect(result).toEqual({ ok: false, error: "Advisor subprocess returned no response" });
  });
});
