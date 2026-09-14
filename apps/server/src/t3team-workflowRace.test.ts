import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it, vi } from "vite-plus/test";

import type { WorkflowRunLifecycle } from "./t3team-workflowEngineBrokerTypes.ts";
import { createWorkflowRunController } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { createWorkflowLiveSettlement } from "./t3team-workflowLiveSettlement.ts";

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
    const recordActive = vi.fn(async () => false);
    const registry = makeWorkflowEngineRegistry();
    const controller = createWorkflowRunController({
      runId: "paused-wake",
      workflowPath: "/tmp/not-loaded.workflow.ts",
      args: {},
      runsRoot: "/tmp",
      launchThreadId: undefined,
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("provider-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: vi.fn(async () => {}),
      newId: () => "id",
      nowIso: () => "2026-07-19T00:00:00.000Z",
      lifecycle: lifecycle({ recordActive }),
    });

    await Promise.all([
      controller.resume("paused-wake:1", {}),
      controller.resume("paused-wake:1", {}),
    ]);

    expect(recordActive).toHaveBeenCalledOnce();
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
