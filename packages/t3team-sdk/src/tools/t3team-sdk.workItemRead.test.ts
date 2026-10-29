import { describe, expect, it } from "vite-plus/test";

import {
  executeRegisteredTool,
  type FetchLike,
  type ToolHandlerCtx,
  type ToolWorkspace,
} from "../t3team-sdk.index.ts";
import {
  getWorkItemTool,
  searchWorkItemsTool,
  WORK_ITEM_SEARCH_MAX_LIMIT,
} from "./t3team-sdk.workItemRead.ts";

const unsupportedFetch: FetchLike = async () => {
  throw new Error("Fetch is not available in this test context.");
};
const noopLog = { info: () => {}, warn: () => {}, error: () => {} } as const;
const noopWorkspace: ToolWorkspace = {
  readText: async () => "",
  writeText: async () => {},
  exists: async () => false,
};

function createToolCtx(overrides: Partial<ToolHandlerCtx> = {}): ToolHandlerCtx {
  return {
    workspaceRoot: "/workspace/project",
    log: noopLog,
    fetch: unsupportedFetch,
    workspace: noopWorkspace,
    callTool: async () => {
      throw new Error("Nested tool calls are not expected in this test.");
    },
    ...overrides,
  };
}

const row = { provider: "atlassian", issueKey: "PROJ-1", title: "First", state: "Open" };

describe("t3team.work_item.search / get", () => {
  it("are read-group tools carrying the host's integration.read id", () => {
    expect(searchWorkItemsTool.group.id).toBe("integration.read");
    expect(getWorkItemTool.group.id).toBe("integration.read");
  });

  it("search forwards the decoded arguments to the host and validates its answer", async () => {
    const calls: unknown[] = [];
    const result = await executeRegisteredTool(
      searchWorkItemsTool.id,
      { status: ["Open"], labels: ["a"], limit: 5 },
      createToolCtx({
        t3team: {
          callHostTool: async (call) => {
            calls.push(call);
            return { ok: true, source: "mirror", items: [row] };
          },
        },
      }),
    );
    expect(calls).toEqual([
      { tool: "t3team.work_item.search", args: { status: ["Open"], labels: ["a"], limit: 5 } },
    ]);
    expect(result).toEqual({ ok: true, source: "mirror", items: [row] });
  });

  it("search rejects an out-of-range limit before it reaches the host", async () => {
    let called = false;
    await expect(
      executeRegisteredTool(
        searchWorkItemsTool.id,
        { limit: WORK_ITEM_SEARCH_MAX_LIMIT + 1 },
        createToolCtx({
          t3team: {
            callHostTool: async () => {
              called = true;
              return {};
            },
          },
        }),
      ),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });

  it("get returns the host's detail and rejects an empty key", async () => {
    const detail = {
      ok: true,
      item: row,
      comments: [],
      commentsTruncated: false,
      links: [],
      children: [],
    };
    const ctx = createToolCtx({ t3team: { callHostTool: async () => detail } });
    expect(await executeRegisteredTool(getWorkItemTool.id, { issueKey: "PROJ-1" }, ctx)).toEqual(
      detail,
    );
    await expect(
      executeRegisteredTool(getWorkItemTool.id, { issueKey: "" }, ctx),
    ).rejects.toThrow();
  });

  it("a headless run (no host client) fails at the call with a sentence naming the cause", async () => {
    await expect(
      executeRegisteredTool(searchWorkItemsTool.id, {}, createToolCtx()),
    ).rejects.toThrow(/needs a thread-bound host runtime/);
  });
});
