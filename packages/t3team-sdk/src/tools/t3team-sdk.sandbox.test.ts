import { describe, expect, it } from "vite-plus/test";

import {
  executeRegisteredTool,
  type FetchLike,
  type ToolHandlerCtx,
  type ToolRef,
  type ToolWorkspace,
} from "../t3team-sdk.index.ts";
import { runSandboxTool } from "./t3team-sdk.sandbox.ts";

const unsupportedFetch: FetchLike = async () => {
  throw new Error("Fetch is not available in this test context.");
};

const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as const;

const noopWorkspace: ToolWorkspace = {
  readText: async () => "",
  writeText: async () => {},
  exists: async () => false,
};

const unsupportedCallTool: ToolHandlerCtx["callTool"] = async <I, R>(
  _ref: ToolRef<I, R>,
  _args: I,
): Promise<R> => {
  throw new Error("Nested tool calls are not expected in this test.");
};

function createToolCtx(overrides: Partial<ToolHandlerCtx> = {}): ToolHandlerCtx {
  return {
    workspaceRoot: "/workspace/project",
    log: noopLog,
    fetch: unsupportedFetch,
    workspace: noopWorkspace,
    callTool: unsupportedCallTool,
    ...overrides,
  };
}

describe("t3team.sandbox.run", () => {
  it("accepts a valid ref + command and forwards them to the host client", async () => {
    const received: Array<{
      readonly ref: string;
      readonly command: string;
      readonly timeoutMs?: number;
    }> = [];
    const result = await executeRegisteredTool(
      runSandboxTool.id,
      { ref: "main", command: "npm test", timeoutMs: 30_000 },
      createToolCtx({
        t3team: {
          runSandbox: async (input) => {
            received.push(input);
            return { exitCode: 0, stdout: "ok", stderr: "", truncated: false, timedOut: false };
          },
        },
      }),
    );

    expect(received).toEqual([{ ref: "main", command: "npm test", timeoutMs: 30_000 }]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      truncated: false,
      timedOut: false,
    });
  });

  it("rejects a blank 'ref'", async () => {
    await expect(
      executeRegisteredTool(
        runSandboxTool.id,
        { ref: "   ", command: "npm test" },
        createToolCtx({ t3team: { runSandbox: async () => ({}) } }),
      ),
    ).rejects.toThrow("t3team.sandbox.run requires a non-empty 'ref'.");
  });

  it("rejects a blank 'command'", async () => {
    await expect(
      executeRegisteredTool(
        runSandboxTool.id,
        { ref: "main", command: "" },
        createToolCtx({ t3team: { runSandbox: async () => ({}) } }),
      ),
    ).rejects.toThrow("t3team.sandbox.run requires a non-empty 'command'.");
  });

  it("fails with a clear error when the host has no sandbox client", async () => {
    await expect(
      executeRegisteredTool(
        runSandboxTool.id,
        { ref: "main", command: "npm test" },
        createToolCtx(),
      ),
    ).rejects.toThrow("t3team.sandbox.run requires a t3team sandbox client in ToolHandlerCtx.");
  });
});
