import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import { workflowShowViewProblem } from "./t3team-workflowEngineBrokerShowView.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const ignore = { resolve: () => {}, reject: () => {} };

function makeBroker() {
  const fake = makeFakeWorkflowHost();
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
  return { fake, showView };
}

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

  it("refuses a host view and a malformed input without posting", async () => {
    const { fake, showView } = makeBroker();

    await expect(
      showView("run-view:1", { key: "k", viewId: "t3team.workflow.decision", props: {} }),
    ).rejects.toThrow(/host view/);
    await expect(
      showView("run-view:2", { key: "k", viewId: "nonamespace", props: {} }),
    ).rejects.toThrow(/<packId>\.<name>/);

    expect(fake.messages()).toEqual([]);
  });

  it("states each refusal reason", () => {
    expect(workflowShowViewProblem({ key: "a b", viewId: "p.v", props: {} })).toMatch(/key/);
    expect(
      workflowShowViewProblem({ key: "k", viewId: "p.v", props: { big: "x".repeat(17_000) } }),
    ).toMatch(/bytes/);
    expect(workflowShowViewProblem({ key: "k", viewId: "p.v", props: { ok: 1 } })).toBeNull();
  });
});
