import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const ignore = { resolve: () => {}, reject: () => {} };

function makeBroker() {
  const fake = makeFakeWorkflowHost();
  const steps: Array<Parameters<WorkflowStepActivityEmitter["emitSent"]>[0]> = [];
  const stepActivities: WorkflowStepActivityEmitter = {
    emitSent: async (step) => {
      steps.push(step);
    },
    emitResolved: async () => {},
    emitRun: async () => {},
  };
  let id = 0;
  const broker = createWorkflowEngineBroker({
    runId: "run-view",
    projectId: ProjectId.make("project-1"),
    modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
    runtimeMode: "full-access",
    interactionMode: "default",
    registry: makeWorkflowEngineRegistry(),
    host: fake.host,
    newId: () => `id-${++id}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
    stepActivities,
  });
  const showView = (correlationId: string, view: Record<string, unknown>) =>
    broker.send(
      {
        correlationId,
        kind: "thread.message",
        payload: { threadId: "launch-1", recipient: "user", text: "", view },
      },
      ignore,
    );
  return { fake, steps, showView };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Thread.showView on the workflow broker", () => {
  it("posts a view attachment under one message id per thread and key", async () => {
    const { fake, showView } = makeBroker();
    const view = { key: "notes:2026-10-07", viewId: "standup.notes", props: { day: "mon" } };

    await showView("run-view:1", view);
    await showView("run-view:2", { ...view, props: { day: "tue" } });

    const [first, second] = fake.messages();
    expect(first).toMatchObject({
      threadId: "launch-1",
      role: "system",
      text: "",
      ext: {
        author: { kind: "system", workflowRunId: "run-view" },
        visibleToAgent: false,
        attachments: [{ kind: "view", miniappId: "standup.notes", props: { day: "mon" } }],
      },
    });
    // Same key → same message id, so the host updates the one row instead of adding another.
    expect(second?.messageId).toBe(first?.messageId);
    expect(second?.ext?.attachments).toEqual([
      { kind: "view", miniappId: "standup.notes", props: { day: "tue" } },
    ]);
  });

  // showView is one-way: the SDK dispatch does `void call.fire(...)` and nobody awaits the send.
  // A rejection there used to be an unhandled rejection, which crashes the server process.
  it("refuses a host or malformed view without rejecting, posting, or an unhandled rejection", async () => {
    const { fake, steps, showView } = makeBroker();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      // Fired exactly as `handlesDispatch.sendOneWay` fires it: not awaited, not caught.
      void showView("run-view:1", { key: "k", viewId: "t3team.workflow.decision", props: {} });
      void showView("run-view:2", { key: "k", viewId: "nonamespace", props: {} });
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(fake.messages()).toEqual([]);
    expect(steps.map((step) => step.detail)).toEqual([
      expect.stringMatching(/^View not shown: .*host view/),
      expect.stringMatching(/^View not shown: .*<packId>\.<name>/),
    ]);
  });
});
