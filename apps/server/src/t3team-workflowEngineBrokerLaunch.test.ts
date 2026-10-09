import { describe, expect, it } from "vite-plus/test";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";

import { handleBrokerLaunchVerb } from "./t3team-workflowEngineBrokerLaunch.ts";
import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";
import type {
  WorkflowHostLaunchedThreadInput,
  WorkflowHostPort,
} from "./t3team-workflowHostPort.ts";

function harness() {
  const verbs: WorkflowHostLaunchedThreadInput[] = [];
  const host = {
    launchedThread: async (input: WorkflowHostLaunchedThreadInput) => {
      verbs.push(input);
      return { ok: true as const, value: undefined };
    },
    launchThread: async () => ({ ok: false as const, error: "unused" }),
  } as unknown as WorkflowHostPort;
  const core = {
    deps: {
      runId: "run-1",
      projectId: ProjectId.make("project:p"),
      recipePath: "/repo/.nexi/recipes/pr-watch",
      modelSelection: { instanceId: ProviderInstanceId.make("i"), model: "m" },
      runtimeMode: "auto-accept-edits",
      interactionMode: "default",
      host,
    },
    enqueue: (fn: () => Promise<void>) => fn(),
    enqueueOneWay: (fn: () => Promise<void>) => fn(),
    runPrimitive: (fn: () => Promise<void>) => fn(),
    step: () => {},
  } as unknown as BrokerCore;
  const send = async (
    correlationId: string,
    payload: object,
    live = false,
    kind = "thread.launched",
  ) => {
    const replies: unknown[] = [];
    await handleBrokerLaunchVerb(core, {
      correlationId,
      kind,
      payload,
      resolver: { resolve: (reply: unknown) => replies.push(reply), reject: () => {} },
      isLiveCompositionAsk: live,
      makeLiveSettlement: () => undefined,
    } as unknown as BrokerSend);
    return replies;
  };
  return { verbs, send, core };
}

describe("launch verbs in the broker", () => {
  const message = { threadId: "t3team-launch:abc", key: "pr:a/b#1", op: "send", text: "hi" };

  it("keys a journaled verb by its correlation, so a re-fire is the same command", async () => {
    const { verbs, send } = harness();
    await send("run-1:4", message);
    await send("run-1:4", message);
    expect(verbs.map((verb) => verb.requestId)).toEqual(["run-1:4", "run-1:4"]);
    expect(verbs[0]).toMatchObject({
      runtimeMode: "auto-accept-edits",
      recipePath: "/repo/.nexi/recipes/pr-watch",
    });
  });

  it("gives a verb inside parallel() a fresh request on every pass", async () => {
    const { verbs, send } = harness();
    // The black-box counter restarts each pass, so the same correlation names two messages.
    await send("run-1:blackbox:1", message, true);
    await send("run-1:blackbox:1", message, true);
    const [first, second] = verbs.map((verb) => verb.requestId);
    expect(first).toMatch(/^run-1:blackbox:1:/);
    expect(second).not.toBe(first);
  });

  it("refuses a configure above the run's mode and an existing worktree, before the host", async () => {
    const { verbs, send } = harness();
    const replies = await send("run-1:5", {
      ...message,
      op: "configure",
      runtimeMode: "full-access",
    });
    expect(replies).toEqual([
      { ok: false, error: "Runtime mode full-access is above this run's auto-accept-edits." },
    ]);
    const existing = await send(
      "run-1:6",
      {
        key: "k",
        title: "t",
        workspace: { type: "existing_worktree", worktreePath: "/elsewhere" },
      },
      false,
      "thread.launch",
    );
    expect(existing[0]).toMatchObject({ ok: false });
    expect(verbs).toEqual([]);
  });
});
