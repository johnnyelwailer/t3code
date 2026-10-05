import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import type { WorkflowEngineBrokerDeps } from "./t3team-workflowEngineBrokerTypes.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const ignore = { resolve: () => {}, reject: () => {} };

const brokerDeps = (
  runId: string,
  overrides: Partial<WorkflowEngineBrokerDeps> = {},
): { deps: WorkflowEngineBrokerDeps; fake: ReturnType<typeof makeFakeWorkflowHost> } => {
  const fake = makeFakeWorkflowHost();
  let id = 0;
  return {
    fake,
    deps: {
      runId,
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      host: fake.host,
      newId: () => `id-${++id}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
  };
};

describe("createWorkflowEngineBroker", () => {
  it("routes explicit, notifyUser, and askUser HTML through typed widget attachments", async () => {
    const { deps, fake } = brokerDeps("run-widget");
    const broker = createWorkflowEngineBroker(deps);

    await broker.send(
      {
        correlationId: "run-widget:1",
        kind: "thread.message",
        payload: {
          threadId: "parent-1",
          recipient: "user",
          text: "",
          widget: {
            title: "release approval",
            widgetCode: "<button>Approve</button>",
            format: "html",
          },
        },
      },
      ignore,
    );
    expect(fake.messages()[0]).toMatchObject({
      threadId: "parent-1",
      text: "",
      ext: {
        visibleToAgent: false,
        attachments: [
          {
            kind: "widget",
            widget: { title: "release_approval", html: "<button>Approve</button>" },
          },
        ],
      },
    });

    await broker.send(
      {
        correlationId: "run-widget:2",
        kind: "thread.message",
        payload: {
          threadId: "parent-1",
          recipient: "user",
          text: "<div>Trusted workflow notification</div>",
        },
      },
      ignore,
    );
    expect(fake.messages()[1]).toMatchObject({
      text: "",
      ext: {
        attachments: [
          { kind: "widget", widget: { html: "<div>Trusted workflow notification</div>" } },
        ],
      },
    });

    await broker.send(
      {
        correlationId: "run-widget:3",
        kind: "user.input",
        payload: {
          threadId: "parent-1",
          question: "<section><strong>Approve release?</strong></section>",
          label: "Release decision",
          affordance: { kind: "choice", options: ["approve", "reject"] },
        },
      },
      ignore,
    );
    expect(fake.messages()[2]).toMatchObject({
      role: "system",
      text: "Release decision",
      ext: {
        status: "waiting-for-input",
        attachments: [
          { kind: "view", props: { question: "Release decision" } },
          {
            kind: "widget",
            widget: { html: "<section><strong>Approve release?</strong></section>" },
          },
        ],
      },
    });
    expect(fake.messages()).toHaveLength(3);
  });

  it("delivers agent-directed notes as a queued turn and user-directed ones as a note", async () => {
    const { deps, fake } = brokerDeps("run-notify");
    const broker = createWorkflowEngineBroker(deps);
    await broker.send(
      {
        correlationId: "run-notify:1",
        kind: "thread.message",
        payload: { threadId: "child-1", recipient: "agent", text: "Prefer terse output." },
      },
      ignore,
    );
    await broker.send(
      {
        correlationId: "run-notify:2",
        kind: "thread.message",
        payload: { threadId: "parent-1", recipient: "user", text: "Halfway there." },
      },
      ignore,
    );
    expect(fake.turns()).toMatchObject([{ threadId: "child-1", text: "Prefer terse output." }]);
    expect(fake.messages()).toMatchObject([
      { threadId: "parent-1", role: "system", text: "Halfway there." },
    ]);
  });

  it("attributes the turn prompt to the workflow step that authored it", async () => {
    const { deps, fake } = brokerDeps("run-attr", { launchThreadId: "parent-attr" });
    const broker = createWorkflowEngineBroker(deps);
    await broker.send(
      {
        correlationId: "run-attr:4",
        kind: "thread.turn",
        payload: {
          threadId: "parent-attr",
          prompt: "Rewrite the description of T3-42.\n\nRead the work item first.",
          label: "Rewrite the description of T3-42",
        },
      },
      ignore,
    );
    // The prompt is a `user`-role message (that is how a provider takes turn input), so the author
    // is the ONLY thing telling a client it was machine-written — and it carries the summary line a
    // collapsed row renders, plus the step id the live plan card is keyed by.
    const [turn] = fake.turns();
    expect(turn?.author).toEqual({
      kind: "workflow",
      workflowRunId: "run-attr",
      stepId: "run-attr:4",
      label: "Rewrite the description of T3-42",
    });
    // The pending ask waits on exactly this prompt's run.
    expect(deps.registry.peekPending("parent-attr")?.promptMessageId).toBe(turn?.messageId);
  });

  it("persists an ask continuation before the host call", async () => {
    const events: string[] = [];
    const fake = makeFakeWorkflowHost();
    const { deps } = brokerDeps("run-order", {
      host: {
        ...fake.host,
        startTurn: async () => void events.push("startTurn"),
        postMessage: async () => void events.push("postMessage"),
      },
      recordPending: async () => {
        events.push("pending-persisted");
      },
    });
    const broker = createWorkflowEngineBroker(deps);
    await broker.send(
      {
        correlationId: "run-order:1",
        kind: "thread.turn",
        payload: { threadId: "child-order", prompt: "Review" },
      },
      ignore,
    );
    expect(events).toEqual(["pending-persisted", "startTurn"]);

    events.length = 0;
    await broker.send(
      {
        correlationId: "run-order:2",
        kind: "user.input",
        payload: { threadId: "parent-order", question: "Approve?" },
      },
      ignore,
    );
    expect(events).toEqual(["pending-persisted", "postMessage"]);
  });

  it("uses an explicit workflow step model for child creation and turns", async () => {
    const permits: string[] = [];
    const { deps, fake } = brokerDeps("run-explicit", {
      launchThreadId: "parent-1",
      modelSelection: createModelSelection(ProviderInstanceId.make("launch"), "launch-model"),
      beforePrimitive: async () => {
        permits.push("acquire");
        return true;
      },
      afterPrimitive: () => permits.push("release"),
    });
    const broker = createWorkflowEngineBroker(deps);
    const explicitModel = {
      provider: "pack-provider",
      model: { kind: "model" as const, id: "pack-provider/coding", provider: "pack-provider" },
    };

    await broker.send(
      {
        correlationId: "child-1",
        kind: "thread.create",
        payload: {
          threadId: "child-1",
          name: "Review release risks",
          retention: "retained",
          model: explicitModel,
        },
      },
      ignore,
    );
    const turn = broker.send(
      {
        correlationId: "run-explicit:blackbox:1",
        kind: "thread.turn",
        payload: { threadId: "child-1", prompt: "Review", model: explicitModel },
      },
      ignore,
    );
    // Explicit-model turns resolve the child model BEFORE recording pending state, so
    // pending appears only after the resolution microtask(s) — poll for it.
    let pending = deps.registry.takePending("child-1");
    for (let attempt = 0; pending === undefined && attempt < 10; attempt += 1) {
      await Promise.resolve();
      pending = deps.registry.takePending("child-1");
    }
    await pending!.resolveLive!("done");
    await turn;

    const selection = { instanceId: "pack-provider", model: "pack-provider/coding" };
    expect(fake.calls).toEqual(
      expect.arrayContaining([
        {
          op: "createThread",
          input: expect.objectContaining({
            title: "Review release risks",
            modelSelection: selection,
            retention: "retained",
            parentThreadId: "parent-1",
          }),
        },
        { op: "startTurn", input: expect.objectContaining({ modelSelection: selection }) },
      ]),
    );
    expect(permits).toEqual(["acquire", "release", "acquire", "release"]);
  });

  it("settles black-boxed asks live without recording a durable pending entry", async () => {
    const durablePending: unknown[] = [];
    const resolved: unknown[] = [];
    const { deps, fake } = brokerDeps("run-1", {
      recordPending: async (pending) => {
        durablePending.push(pending);
      },
    });
    const broker = createWorkflowEngineBroker(deps);

    const send = broker.send(
      {
        correlationId: "run-1:blackbox:1",
        kind: "thread.turn",
        payload: { threadId: "child-1", prompt: "Review this" },
      },
      { resolve: (reply) => resolved.push(reply), reject: () => {} },
    );

    const pending = deps.registry.takePending("child-1");
    for (let attempt = 0; fake.calls.length === 0 && attempt < 10; attempt += 1) {
      await Promise.resolve();
    }
    expect(pending?.resolveLive).toBeDefined();
    expect(durablePending).toEqual([]);
    expect(fake.ops()).toEqual(["startTurn"]);

    await pending!.resolveLive!({ summary: "Looks good" });
    await send;

    expect(resolved).toEqual([{ summary: "Looks good" }]);
  });

  it("links every spawned child under the launch thread, with its retention", async () => {
    const { deps, fake } = brokerDeps("run-nest", { launchThreadId: "parent-1" });
    const broker = createWorkflowEngineBroker(deps);
    await broker.send(
      {
        correlationId: "run-nest:1",
        kind: "thread.create",
        payload: { threadId: "child-1", name: "Risk analysis", retention: "retained" },
      },
      ignore,
    );
    await broker.send(
      {
        correlationId: "run-nest:2",
        kind: "thread.create",
        payload: { threadId: "child-2", name: "One shot" },
      },
      ignore,
    );
    expect(fake.calls).toMatchObject([
      {
        op: "createThread",
        input: { threadId: "child-1", parentThreadId: "parent-1", retention: "retained" },
      },
      {
        op: "createThread",
        input: { threadId: "child-2", parentThreadId: "parent-1", retention: "ephemeral" },
      },
    ]);
  });

  it("does not create the same workflow child twice for a retried thread.create", async () => {
    const { deps, fake } = brokerDeps("run-idempotent");
    const broker = createWorkflowEngineBroker(deps);
    for (const correlationId of ["run-idempotent:1", "run-idempotent:2"]) {
      await broker.send(
        {
          correlationId,
          kind: "thread.create",
          payload: { threadId: "child-1", name: "Retry target" },
        },
        ignore,
      );
    }
    expect(fake.ops().filter((op) => op === "createThread")).toHaveLength(1);
  });

  it("fails the ask when the host cannot start the step's turn", async () => {
    const fake = makeFakeWorkflowHost({ failOn: "startTurn" });
    const { deps } = brokerDeps("run-reject", { host: fake.host });
    const broker = createWorkflowEngineBroker(deps);
    await expect(
      broker.send(
        {
          correlationId: "run-reject:1",
          kind: "thread.turn",
          payload: { threadId: "child-reject", prompt: "Review" },
        },
        ignore,
      ),
    ).rejects.toThrow("host startTurn failed");
  });
});
