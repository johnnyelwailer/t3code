/**
 * Unit coverage for the `thread.handoff` bridge, mirroring the scenarios pinned for the draft
 * family in `t3team-workflowHostDraftTools.test.ts`, but at the client/ref level rather than a full
 * `launchWorkflowRecipe` pipeline: `t3team.thread.start_child` needs a real child-provider/session
 * stack to actually run, which is out of scope for this seam — what this seam owns is "does the
 * bridge route the call, honour the whitelist, and turn a broker failure into a thrown error", and
 * that is exactly what a fake broker can prove without any of that infrastructure.
 *
 *   1. an id outside the family's whitelist is rejected before the broker is ever touched;
 *   2. a headless run (no `ctx.t3team`) fails the ref's handler with a named cause;
 *   3. a broker error result (`isError: true`) is thrown, not returned as data;
 *   4. a successful broker result's `structuredContent` passes through unchanged.
 */

import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type {
  T3TeamToolBinding,
  T3TeamToolBrokerShape,
  T3TeamToolCallResult,
} from "./t3team-toolBroker.ts";
import {
  HOST_HANDOFF_TOOL_ID_SET,
  T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_REFS,
} from "./t3team-workflowHostHandoffTools.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostToolClientShared.ts";

const START_CHILD = "t3team.thread.start_child";
const launchThreadId = "thread-launch-1";

/** `callHostTool` is optional on the client type (present only on a thread-bound run); every test
 * here constructs a client WITH a launch thread, so it is always present — this just narrows the
 * type instead of sprinkling non-null assertions through every call site. */
function callHostTool(
  client: ReturnType<typeof makeT3TeamWorkflowHostToolClient>,
  input: { readonly tool: string; readonly args: unknown },
): Promise<unknown> {
  const fn = client?.callHostTool;
  if (fn === undefined) throw new Error("test setup error: client has no callHostTool");
  return fn(input);
}

function makeFakeBroker(callTool: T3TeamToolBinding["callTool"]): T3TeamToolBrokerShape {
  return {
    sendMessage: () => Effect.fail("not used"),
    bindSession: ({ threadId }) =>
      Effect.succeed({
        threadId,
        listServers: () => [],
        callTool,
        readResource: () => Effect.succeed({ contents: [] }),
      }),
    bindReadOnly: () => Effect.succeed(undefined),
  };
}

describe("workflow host handoff tools", () => {
  it("rejects an id outside the thread.handoff whitelist before touching the broker", async () => {
    let called = false;
    const broker = makeFakeBroker(() => {
      called = true;
      return Effect.succeed({ content: [] });
    });
    const client = makeT3TeamWorkflowHostToolClient({
      broker,
      launchThreadId,
      allowedToolIds: HOST_HANDOFF_TOOL_ID_SET,
    });

    await expect(
      callHostTool(client, { tool: "t3team.thread.rename_other", args: {} }),
    ).rejects.toThrow("is not exposed to workflow bodies");
    expect(called).toBe(false);
  });

  it("a headless run (no ctx.t3team) fails the ref's handler by name", async () => {
    const ref = T3TEAM_WORKFLOW_HOST_HANDOFF_TOOL_REFS.find((r) => r.id === START_CHILD);
    expect(ref).toBeDefined();

    await expect(
      ref?.handler({ name: "child" }, {
        workspaceRoot: "/workspace",
        log: { info: () => {}, warn: () => {}, error: () => {} },
        fetch: fetch,
        workspace: {} as never,
        callTool: async () => {
          throw new Error("not used");
        },
      } as never),
    ).rejects.toThrow("thread-bound host runtime");
  });

  it("throws when the broker returns an error result, instead of returning it as data", async () => {
    const result: T3TeamToolCallResult = {
      content: [{ type: "text", text: "start_child failed: no provider configured" }],
      isError: true,
    };
    const broker = makeFakeBroker(() => Effect.succeed(result));
    const client = makeT3TeamWorkflowHostToolClient({
      broker,
      launchThreadId,
      allowedToolIds: HOST_HANDOFF_TOOL_ID_SET,
    });

    await expect(
      callHostTool(client, { tool: START_CHILD, args: { name: "child" } }),
    ).rejects.toThrow("no provider configured");
  });

  it("passes a successful broker result's structuredContent through unchanged", async () => {
    const structuredContent = { threadId: "thread-child-1", ok: true };
    const broker = makeFakeBroker(({ tool, threadId }) => {
      expect(tool).toBe(START_CHILD);
      expect(threadId).toBe(launchThreadId);
      return Effect.succeed({ content: [], structuredContent, isError: false });
    });
    const client = makeT3TeamWorkflowHostToolClient({
      broker,
      launchThreadId,
      allowedToolIds: HOST_HANDOFF_TOOL_ID_SET,
    });

    const result = await callHostTool(client, { tool: START_CHILD, args: { name: "child" } });
    expect(result).toEqual(structuredContent);
  });

  it("binds the LAUNCH thread id passed at construction", async () => {
    const broker = makeFakeBroker(() => Effect.succeed({ content: [], structuredContent: {} }));
    let boundThreadId: ThreadId | undefined;
    const spyBroker: T3TeamToolBrokerShape = {
      ...broker,
      bindSession: (input) => {
        boundThreadId = input.threadId;
        return broker.bindSession(input);
      },
    };
    const client = makeT3TeamWorkflowHostToolClient({
      broker: spyBroker,
      launchThreadId,
      allowedToolIds: HOST_HANDOFF_TOOL_ID_SET,
    });
    await callHostTool(client, { tool: START_CHILD, args: {} });
    expect(boundThreadId).toBe(ThreadId.make(launchThreadId));
  });

  it("forwards the recipe's allowedToolGroups to every bindSession call", async () => {
    const allowedToolGroups = ["integration.read", "thread.handoff"];
    const broker = makeFakeBroker(() => Effect.succeed({ content: [], structuredContent: {} }));
    let boundGroups: ReadonlyArray<string> | undefined;
    const spyBroker: T3TeamToolBrokerShape = {
      ...broker,
      bindSession: (input: { threadId: ThreadId; allowedToolGroups?: ReadonlyArray<string> }) => {
        boundGroups = input.allowedToolGroups;
        return broker.bindSession(input);
      },
    };
    const client = makeT3TeamWorkflowHostToolClient({
      broker: spyBroker,
      launchThreadId,
      allowedToolIds: HOST_HANDOFF_TOOL_ID_SET,
      allowedToolGroups,
    });
    await callHostTool(client, { tool: START_CHILD, args: {} });
    // Dropping this silently widens a narrowly-scoped recipe to the thread's full tool surface.
    expect(boundGroups).toEqual(allowedToolGroups);
  });
});
