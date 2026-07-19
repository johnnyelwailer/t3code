import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it, vi } from "vite-plus/test";

import type { WorkflowRunLifecycle } from "./t3work-workflowEngineBrokerTypes.ts";
import { createWorkflowRunController } from "./t3work-workflowEngineLaunch.ts";
import { makeControllerResume } from "./t3work-workflowEngineResume.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { createWorkflowLiveSettlement } from "./t3work-workflowLiveSettlement.ts";

const lifecycle = (overrides: Partial<WorkflowRunLifecycle> = {}): WorkflowRunLifecycle => ({
  recordRunning: async () => {},
  recordActive: async () => true,
  releaseActive: () => {},
  recordSuspended: async () => {},
  recordSleeping: async () => {},
  recordCompleted: async () => {},
  recordFailed: async () => {},
  orphanIfSleeping: async () => {},
  ...overrides,
});

describe("workflow orchestration race boundaries", () => {
  it("Stop winning during terminal persistence suppresses completion delivery", async () => {
    const registry = makeWorkflowEngineRegistry();
    let releaseCompleted!: () => void;
    const completedGate = new Promise<void>((resolve) => {
      releaseCompleted = resolve;
    });
    const onComplete = vi.fn(async () => {});
    const dispatch = vi.fn(async () => {});
    const controller = createWorkflowRunController({
      runId: "stop-vs-complete",
      workflowPath: "/tmp/not-loaded.workflow.ts",
      args: {},
      runsRoot: "/tmp",
      launchThreadId: "thread-1",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("provider-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch,
      newId: () => "id",
      nowIso: () => "2026-07-19T00:00:00.000Z",
      lifecycle: lifecycle({ recordCompleted: () => completedGate }),
      onComplete,
    });

    const settling = controller.settle({ result: { ok: true } } as never);
    await Promise.resolve();
    registry.cancelRun("stop-vs-complete");
    releaseCompleted();

    expect(await settling).toBe("suspended");
    expect(onComplete).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Pause/Stop winning admission leaves the durable reply unresolved", async () => {
    const appendResolved = vi.fn(async () => true);
    const recordActive = vi.fn(async () => false);
    const registry = makeWorkflowEngineRegistry();
    const registered = { resume: async () => {}, cancel: () => {} };
    registry.registerRun("paused-wake", registered);
    const resume = makeControllerResume({
      input: {
        runId: "paused-wake",
        runsRoot: "/tmp",
        registry,
        lifecycle: lifecycle({ recordActive }),
      } as never,
      ref: { kind: "workflow", path: "/tmp/w.workflow.ts", absolutePath: "/tmp/w.workflow.ts" },
      options: {} as never,
      settle: vi.fn(async (): Promise<"completed"> => "completed"),
      stepActivities: {
        emitSent: async () => {},
        emitResolved: async () => {},
        emitRun: async () => {},
      },
      appendResolved,
    });

    await Promise.all([resume("paused-wake:1", {}), resume("paused-wake:1", {})]);

    expect(recordActive).toHaveBeenCalledOnce();
    expect(appendResolved).not.toHaveBeenCalled();
  });

  it("routes a post-resume runtime failure through the same repair funnel", async () => {
    const registry = makeWorkflowEngineRegistry();
    registry.registerRun("resume-repair", { resume: async () => {}, cancel: () => {} });
    const recordFailed = vi.fn(async () => {});
    const emitRun = vi.fn(async () => {});
    const repair = vi.fn(async () => true);
    const resume = makeControllerResume({
      input: {
        runId: "resume-repair",
        runsRoot: "/tmp",
        registry,
        lifecycle: lifecycle({ recordFailed }),
      } as never,
      ref: { kind: "workflow", path: "/tmp/w.workflow.ts", absolutePath: "/tmp/w.workflow.ts" },
      options: {} as never,
      settle: vi.fn(async () => {
        throw new TypeError("members.map is not a function");
      }),
      stepActivities: {
        emitSent: async () => {},
        emitResolved: async () => {},
        emitRun,
      },
      appendResolved: vi.fn(async () => true),
      repair,
    });

    await resume("resume-repair:1", "approved");

    expect(repair).toHaveBeenCalledOnce();
    expect(recordFailed).not.toHaveBeenCalled();
    expect(emitRun).not.toHaveBeenCalledWith("failed", expect.anything());
  });

  it("first matching settlement consumes the pending ask; duplicates and late replies do not", () => {
    const registry = makeWorkflowEngineRegistry();
    registry.setPending("child-1", {
      runId: "run-1",
      correlationId: "run-1:1",
      kind: "thread.turn",
    });

    expect(registry.takePending("child-1")?.correlationId).toBe("run-1:1");
    expect(registry.takePending("child-1")).toBeUndefined();
  });

  it("coalesces duplicate live child settlements", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const beforeResolve = vi.fn(() => gate);
    const resolve = vi.fn();
    const settlement = createWorkflowLiveSettlement({ beforeResolve, resolve });

    const first = settlement.resolve({ answer: "first" });
    const duplicate = settlement.resolve({ answer: "duplicate" });
    expect(beforeResolve).toHaveBeenCalledOnce();
    release();
    await Promise.all([first, duplicate, settlement.completed]);

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith({ answer: "first" });
  });
});
