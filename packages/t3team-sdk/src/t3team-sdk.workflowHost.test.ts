/**
 * Host-neutral per-run host tests: the launch → settle → resume → fail funnel
 * (`createWorkflowRunHost`) behaves identically regardless of the host that
 * supplies its sinks — the t3team server's race-boundary suite covers the
 * server sinks on top of the same funnel.
 */

import { afterAll, describe, expect, it, vi } from "vite-plus/test";

import {
  createWorkflowHostRegistry,
  createWorkflowRunHost,
  type WorkflowHostLifecycle,
} from "./t3team-sdk.index.ts";
import {
  askResponseWorkflow,
  cleanupRunsRoot,
  demoTools,
  voidResultWorkflow,
} from "./t3team-sdk.engineFixtures.ts";
import { createMockBroker } from "./t3team-sdk.broker.ts";

const alwaysDefer = () => ({ kind: "defer" } as const);

const lifecycle = (
  overrides: Partial<WorkflowHostLifecycle> = {},
): WorkflowHostLifecycle => ({
  recordRunning: async () => {},
  recordActive: async () => true,
  releaseActive: () => {},
  recordCompleted: async () => {},
  recordFailed: async () => {},
  orphanIfSleeping: async () => {},
  ...overrides,
});

describe("durable workflow engine — shared per-run host", () => {
  afterAll(cleanupRunsRoot);

  it("start drives the body through the shared funnel to completion", async () => {
    const registry = createWorkflowHostRegistry();
    let recordRunning = 0;
    let recordCompleted = 0;
    const onCompleted = vi.fn(async () => {});
    const onFailed = vi.fn(async () => {});
    const host = createWorkflowRunHost({
      ref: voidResultWorkflow,
      args: { note: "host" },
      runId: "host-start",
      runOptions: { runsRoot: "unused", tools: demoTools },
      registry,
      lifecycle: lifecycle({
        recordRunning: async () => {
          recordRunning += 1;
        },
        recordCompleted: async () => {
          recordCompleted += 1;
        },
      }),
      sinks: { onCompleted, onFailed },
    });
    const status = await host.start();
    expect(status).toBe("completed");
    expect(recordRunning).toBe(1);
    expect(recordCompleted).toBe(1);
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(onFailed).not.toHaveBeenCalled();
    expect(registry.getRun("host-start")).toBeUndefined();
  });

  it("start suspends on a deferred ask; resume journals the reply and replays to completion", async () => {
    const registry = createWorkflowHostRegistry();
    const onCompleted = vi.fn(async () => {});
    const onReplyJournaled = vi.fn(async () => {});
    const host = createWorkflowRunHost({
      ref: askResponseWorkflow,
      args: { question: "ship it?" },
      runId: "host-ask",
      runOptions: {
        runsRoot: "unused",
        tools: [],
        broker: createMockBroker(alwaysDefer),
        launchThreadId: "launch-thread",
      },
      registry,
      sinks: { onCompleted, onFailed: vi.fn(async () => {}) },
      onReplyJournaled,
    });
    const status = await host.start();
    expect(status).toBe("suspended");
    expect(onCompleted).not.toHaveBeenCalled();
    // The body's first journal entry is the ask → its correlation id is `<runId>:1`.
    await host.resume("host-ask:1", "yes");
    expect(onReplyJournaled).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(registry.getRun("host-ask")).toBeUndefined();
  });

  it("a concurrent second resume never double-drives; a lost admission leaves the reply unresolved", async () => {
    const registry = createWorkflowHostRegistry();
    const appendResolved = vi.fn(async () => true);
    const recordActive = vi.fn(async () => false);
    const host = createWorkflowRunHost({
      ref: askResponseWorkflow,
      args: { question: "ship it?" },
      runId: "host-admission",
      runOptions: {
        runsRoot: "unused",
        tools: [],
        broker: createMockBroker(alwaysDefer),
        launchThreadId: "launch-thread",
      },
      registry,
      lifecycle: lifecycle({ recordActive }),
      sinks: { onFailed: vi.fn(async () => {}) },
      appendResolved,
    });
    await Promise.all([
      host.resume("host-admission:1", {}),
      host.resume("host-admission:1", {}),
    ]);
    expect(recordActive).toHaveBeenCalledOnce();
    expect(appendResolved).not.toHaveBeenCalled();
  });

  it("a post-resume replay failure takes the bounded repair funnel before the failure sink", async () => {
    const registry = createWorkflowHostRegistry();
    const repair = vi.fn(async () => true);
    const onFailed = vi.fn(async () => {});
    let recordFailed = 0;
    const host = createWorkflowRunHost({
      // No source on disk: the replay cannot load the body → the error the
      // pre-refactor server funnel fed to `tryWorkflowRepair`.
      ref: {
        kind: "workflow",
        path: "/tmp/never-existed.workflow.ts",
        absolutePath: "/tmp/never-existed.workflow.ts",
      },
      args: {},
      runId: "host-repair",
      runOptions: { runsRoot: "unused", tools: [] },
      registry,
      lifecycle: lifecycle({
        recordFailed: async () => {
          recordFailed += 1;
        },
      }),
      sinks: { onFailed },
      repair: () => repair,
      appendResolved: async () => true,
    });
    await host.resume("host-repair:1", "approved");
    expect(repair).toHaveBeenCalledOnce();
    expect(onFailed).not.toHaveBeenCalled();
    expect(recordFailed).toBe(0);
  });

  it("Stop winning during terminal persistence suppresses completion delivery", async () => {
    const registry = createWorkflowHostRegistry();
    let releaseCompleted!: () => void;
    const completedGate = new Promise<void>((resolve) => {
      releaseCompleted = resolve;
    });
    const onCompleted = vi.fn(async () => {});
    const host = createWorkflowRunHost({
      ref: voidResultWorkflow,
      args: { note: "x" },
      runId: "host-stop",
      runOptions: { runsRoot: "unused", tools: demoTools },
      registry,
      lifecycle: lifecycle({ recordCompleted: () => completedGate }),
      sinks: { onCompleted, onFailed: vi.fn(async () => {}) },
    });
    const settling = host.settle({ result: { ok: true } });
    await Promise.resolve();
    host.cancel();
    releaseCompleted();
    expect(await settling).toBe("suspended");
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
