/**
 * A child the host REFUSES to create (a launch thread whose checkout cannot be inherited, an
 * unreadable project) must not be reported as spawned: the `completed` step pip and the registry
 * entry are both claims that the thread is there, and a phantom child hides the real failure behind
 * a run that continues into a turn on a missing thread.
 *
 * It also must not be reported as a crash. `spawnThread` fires `thread.create` through the SDK's
 * one-way `sendOneWay`, which does `void call.fire(...)` — there is no caller to reject to, so a
 * refusal cannot travel out of this send. The contract is therefore: the create settles
 * successfully and quietly, and the refusal surfaces on the next AWAITED verb for that child (the
 * `thread.turn` every `agent()` sends), with the host's own error object.
 *
 * The real {@link createWorkflowEngineBroker} is used here — the defect lives in the composition of
 * the broker's serialised queue, its step emitter and the placement module's registry write, so a
 * hand-built `BrokerCore` would reproduce none of it.
 */
import {
  createMockBroker,
  createThreadPrimitives,
  type HandleDispatch,
  type MessageBroker,
} from "@t3team/sdk";
import { describe, expect, it } from "vite-plus/test";

import {
  CHILD_SPAWN_LAUNCH_THREAD_ID,
  flushRejections,
  makeChildSpawnHarness,
  makeRefusingWorkflowHost,
  MISSING_LAUNCH_CHECKOUT,
} from "./t3team-workflowEngineChildSpawn.fixtures.ts";

const ignore = { resolve: () => {}, reject: () => {} };

const spawnChild = (correlationId: string, threadId: string) => ({
  correlationId,
  kind: "thread.create" as const,
  payload: { threadId, name: "Risk analysis", retention: "retained" as const },
});

const askChild = (correlationId: string, threadId: string) => ({
  correlationId,
  kind: "thread.turn" as const,
  payload: { threadId, prompt: "Summarise the risk" },
});

/**
 * A `HandleDispatch` shaped like the real one (`@runbook/core`'s `createHandleDispatch`): the
 * one-way send fires FLOATING (`void call.fire`), the ask send awaits its fire. This is the seam
 * that decides whether a refused create becomes an unhandled rejection, so the SDK tests below
 * drive it rather than a hand-rolled promise chain.
 */
function floatedDispatch() {
  const settled = new Map<string, unknown>();
  let seq = 0;
  const dispatch: HandleDispatch = {
    send: async (call) => {
      const id = `run-spawn:${++seq}`;
      await call.fire(id, {
        resolve: (reply) => settled.set(id, reply),
        reject: () => {},
      });
      return id;
    },
    sendOneWay: (call) => {
      const id = `run-spawn:${++seq}`;
      void call.fire(id, { resolve: () => {}, reject: () => {} });
      return id;
    },
    awaitResolution: async <R>(id: string) => settled.get(id) as R,
  };
  return { dispatch };
}

/** The real SDK `spawnThread`/`agent` surface, over the real broker plus a mock reply broker. */
function sdkPrimitives(broker: MessageBroker) {
  const replyBroker = createMockBroker(() => ({ kind: "resolve", reply: "done" }));
  return createThreadPrimitives({
    dispatch: floatedDispatch().dispatch,
    broker: {
      send: async (envelope, resolver) => {
        await broker.send(envelope, resolver);
        await replyBroker.send(envelope, resolver);
      },
    },
    capabilities: new Set(),
    launchThreadId: CHILD_SPAWN_LAUNCH_THREAD_ID,
    // No default model: the child rides the run's own selection, which keeps the SDK test free of
    // a provider registry (the failure under test is placement, not model choice).
    defaultModel: undefined,
  });
}

describe("thread.create when the host refuses the child", () => {
  it("settles the one-way send, registers nothing, and emits no completed spawn step", async () => {
    const { host, attempts, created } = makeRefusingWorkflowHost(
      new Error(MISSING_LAUNCH_CHECKOUT),
    );
    const { broker, registry, spawnPips } = makeChildSpawnHarness(host);

    await expect(
      broker.send(spawnChild("run-spawn:1", "child-1"), ignore),
    ).resolves.toBeUndefined();
    expect(attempts.map((attempt) => attempt.threadId)).toEqual(["child-1"]);
    expect(created).toEqual([]);
    expect(registry.childThreadsForRun("run-spawn")).toEqual([]);
    expect(spawnPips()).toEqual([]);
  });

  it("re-throws the ORIGINAL refusal on that child's next awaited turn, starting no turn", async () => {
    const refusal = new Error(MISSING_LAUNCH_CHECKOUT);
    const { host, turns } = makeRefusingWorkflowHost(refusal);
    const { broker, registry } = makeChildSpawnHarness(host);

    await broker.send(spawnChild("run-spawn:1", "child-1"), ignore);
    // Same object, not a copy: the author's `catch` must see the host's own error.
    const thrown = await broker.send(askChild("run-spawn:2", "child-1"), ignore).catch((e) => e);
    expect(thrown).toBe(refusal);
    expect(turns).toEqual([]);
    expect(registry.childThreadsForRun("run-spawn")).toEqual([]);
  });

  it("leaves a thread the run owns alone: an unrelated thread still gets its turn", async () => {
    const { host, turns } = makeRefusingWorkflowHost(new Error(MISSING_LAUNCH_CHECKOUT));
    const { broker } = makeChildSpawnHarness(host);

    await broker.send(spawnChild("run-spawn:1", "child-1"), ignore);
    await expect(broker.send(askChild("run-spawn:2", "child-2"), ignore)).resolves.toBeUndefined();
    expect(turns.map((turn) => turn.threadId)).toEqual(["child-2"]);
  });

  it("clears the refusal on a successful retry: the turn starts and the child registers once", async () => {
    const { host, attempts, created, turns } = makeRefusingWorkflowHost(
      new Error(MISSING_LAUNCH_CHECKOUT),
    );
    const { broker, registry, spawnPips } = makeChildSpawnHarness(host);

    await broker.send(spawnChild("run-spawn:1", "child-1"), ignore);
    await broker.send(spawnChild("run-spawn:2", "child-1"), ignore);
    // A journaled re-fire of the same child (same thread id) must not create or register twice.
    await broker.send(spawnChild("run-spawn:3", "child-1"), ignore);

    // One refused attempt, one successful create — the duplicate re-fire never reaches the host.
    expect(attempts.map((attempt) => attempt.threadId)).toEqual(["child-1", "child-1"]);
    expect(created).toMatchObject([
      { threadId: "child-1", title: "Risk analysis", retention: "retained" },
    ]);
    expect(registry.childThreadsForRun("run-spawn")).toEqual(["child-1"]);
    expect(spawnPips().map((step) => step.threadId)).toEqual(["child-1"]);

    // The refusal is gone, so the child's turn dispatches normally.
    await expect(broker.send(askChild("run-spawn:4", "child-1"), ignore)).resolves.toBeUndefined();
    expect(turns.map((turn) => turn.threadId)).toEqual(["child-1"]);
  });

  it("creates once when two creates for the same child are fired back to back", async () => {
    const { host, attempts, created } = makeRefusingWorkflowHost(new Error("unused"), 0);
    const { broker, registry, spawnPips } = makeChildSpawnHarness(host);

    await Promise.all([
      broker.send(spawnChild("run-spawn:1", "child-1"), ignore),
      broker.send(spawnChild("run-spawn:2", "child-1"), ignore),
    ]);

    expect(attempts).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(registry.childThreadsForRun("run-spawn")).toEqual(["child-1"]);
    // Both sends resolved; only the create that reached the host claims a completed spawn.
    expect(spawnPips()).toHaveLength(1);
  });

  it("keeps the queue usable after a refusal and still honours the stop gate", async () => {
    const { host, attempts, created, turns } = makeRefusingWorkflowHost(
      new Error(MISSING_LAUNCH_CHECKOUT),
    );
    const permits: string[] = [];
    let stopped = false;
    const { broker, registry, spawnPips } = makeChildSpawnHarness(host, {
      beforePrimitive: async () => {
        permits.push("acquire");
        return !stopped;
      },
      afterPrimitive: () => permits.push("release"),
    });

    await broker.send(spawnChild("run-spawn:1", "child-1"), ignore);
    // The refusal must not wedge the serialised queue: the next child lands normally.
    await broker.send(spawnChild("run-spawn:2", "child-2"), ignore);
    expect(attempts.map((attempt) => attempt.threadId)).toEqual(["child-1", "child-2"]);
    expect(created.map((create) => create.threadId)).toEqual(["child-2"]);
    expect(registry.childThreadsForRun("run-spawn")).toEqual(["child-2"]);
    expect(spawnPips().map((step) => step.threadId)).toEqual(["child-2"]);
    expect(turns).toEqual([]);

    // The stop gate runs before the dispatch, so a stopped run never reaches the host (and never
    // holds a permit the gate already refused).
    stopped = true;
    await expect(broker.send(spawnChild("run-spawn:3", "child-3"), ignore)).rejects.toThrow(
      "Workflow was stopped",
    );
    expect(attempts).toHaveLength(2);
    expect(registry.childThreadsForRun("run-spawn")).toEqual(["child-2"]);
    // One permit per dispatched primitive, every dispatched permit released (the refusal too).
    expect(permits).toEqual(["acquire", "release", "acquire", "release", "acquire"]);
  });
});

describe("a refused spawn through the real SDK primitives", () => {
  it("resolves the create silently, observes the error on the awaited agent(), and leaks no unhandled rejection", async () => {
    const refusal = new Error(MISSING_LAUNCH_CHECKOUT);
    const { host, attempts, created, turns } = makeRefusingWorkflowHost(refusal);
    const { broker, registry } = makeChildSpawnHarness(host);
    const primitives = sdkPrimitives(broker);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      // `agent()` is spawn + awaited turn: the spawn cannot reject (it is one-way), so the
      // refusal MUST arrive here, on the awaited half.
      await expect(primitives.agent("Review the risk", { capabilities: "inherit" })).rejects.toBe(
        refusal,
      );
      await flushRejections();
      expect(unhandled).toEqual([]);
      expect(attempts).toHaveLength(1);
      expect(created).toEqual([]);
      expect(turns).toEqual([]);
      expect(registry.childThreadsForRun("run-spawn")).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("registers once and runs the turn when a spawned child is created after the refusal", async () => {
    const { host, created, turns } = makeRefusingWorkflowHost(new Error(MISSING_LAUNCH_CHECKOUT));
    const { broker, registry } = makeChildSpawnHarness(host);
    const primitives = sdkPrimitives(broker);

    await expect(primitives.agent("Review the risk", { capabilities: "inherit" })).rejects.toThrow(
      MISSING_LAUNCH_CHECKOUT,
    );
    // The second attempt lands on a host that now accepts: the child exists and its turn runs.
    await expect(primitives.agent("Review the risk", { capabilities: "inherit" })).resolves.toBe(
      "done",
    );
    expect(created).toHaveLength(1);
    expect(turns.map((turn) => turn.threadId)).toEqual([created[0]?.threadId]);
    expect(registry.childThreadsForRun("run-spawn")).toEqual([created[0]?.threadId]);
  });
});
