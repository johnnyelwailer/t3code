import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";

describe("createWorkflowEngineBroker", () => {
  it("routes explicit, notifyUser, and askUser HTML through typed widget attachments", async () => {
    const dispatched: OrchestrationCommand[] = [];
    let id = 0;
    const broker = createWorkflowEngineBroker({
      runId: "run-widget",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      dispatch: async (command) => void dispatched.push(command),
      newId: () => `id-${++id}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

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
      { resolve: () => {}, reject: () => {} },
    );
    const widgetMessage = dispatched.find((command) => command.type === "thread.message.upsert");
    expect(widgetMessage).toMatchObject({
      type: "thread.message.upsert",
      message: {
        text: "",
        t3teamExt: {
          visibleToAgent: false,
          attachments: [
            {
              kind: "widget",
              widget: { title: "release_approval", html: "<button>Approve</button>" },
            },
          ],
        },
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
      { resolve: () => {}, reject: () => {} },
    );
    expect(dispatched[1]).toMatchObject({
      type: "thread.message.upsert",
      message: {
        text: "",
        t3teamExt: {
          attachments: [
            {
              kind: "widget",
              widget: { html: "<div>Trusted workflow notification</div>" },
            },
          ],
        },
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
      { resolve: () => {}, reject: () => {} },
    );
    expect(dispatched[2]).toMatchObject({
      type: "thread.message.upsert",
      message: {
        text: "Release decision",
        t3teamExt: {
          status: "waiting-for-input",
          attachments: [
            { kind: "view", props: { question: "Release decision" } },
            {
              kind: "widget",
              widget: { html: "<section><strong>Approve release?</strong></section>" },
            },
          ],
        },
      },
    });
    expect(dispatched).toHaveLength(3);
  });

  it("attributes the turn prompt to the workflow step that authored it", async () => {
    const dispatched: OrchestrationCommand[] = [];
    const broker = createWorkflowEngineBroker({
      runId: "run-attr",
      launchThreadId: "parent-attr",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      dispatch: async (command) => {
        dispatched.push(command);
      },
      newId: () => "id-1",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
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
      { resolve: () => {}, reject: () => {} },
    );

    // The prompt is a `user`-role message (that is how a provider takes turn input), so the author
    // is the ONLY thing telling a client it was machine-written — and it carries the summary line a
    // collapsed row renders, plus the step id the live plan card is keyed by.
    const turn = dispatched.find((command) => command.type === "thread.turn.start");
    expect(turn?.type === "thread.turn.start" ? turn.message.role : undefined).toBe("user");
    expect(turn?.type === "thread.turn.start" ? turn.message.t3teamExt?.author : undefined).toEqual(
      {
        kind: "workflow",
        workflowRunId: "run-attr",
        stepId: "run-attr:4",
        label: "Rewrite the description of T3-42",
      },
    );
  });

  it("persists an ask continuation before dispatching the child turn", async () => {
    const events: string[] = [];
    const broker = createWorkflowEngineBroker({
      runId: "run-order",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      dispatch: async (command) => {
        events.push(command.type);
      },
      recordPending: async () => {
        events.push("pending-persisted");
      },
      newId: () => "id-1",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    await broker.send(
      {
        correlationId: "run-order:1",
        kind: "thread.turn",
        payload: { threadId: "child-order", prompt: "Review" },
      },
      { resolve: () => {}, reject: () => {} },
    );
    expect(events).toEqual(["pending-persisted", "thread.turn.start"]);

    events.length = 0;
    await broker.send(
      {
        correlationId: "run-order:2",
        kind: "user.input",
        payload: { threadId: "parent-order", question: "Approve?" },
      },
      { resolve: () => {}, reject: () => {} },
    );
    expect(events).toEqual(["pending-persisted", "thread.message.upsert"]);
  });

  it("uses an explicit workflow step model for child creation and turns", async () => {
    const registry = makeWorkflowEngineRegistry();
    const dispatched: OrchestrationCommand[] = [];
    const permits: string[] = [];
    const broker = createWorkflowEngineBroker({
      runId: "run-explicit",
      launchThreadId: "parent-1",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("launch"), "launch-model"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      beforePrimitive: async () => {
        permits.push("acquire");
        return true;
      },
      afterPrimitive: () => permits.push("release"),
      dispatch: async (command) => {
        dispatched.push(command);
      },
      newId: () => "id-1",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    const explicitModel = {
      provider: "nexplore",
      model: { kind: "model" as const, id: "nexplore/coding", provider: "nexplore" },
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
      { resolve: () => {}, reject: () => {} },
    );
    const turn = broker.send(
      {
        correlationId: "run-explicit:blackbox:1",
        kind: "thread.turn",
        payload: { threadId: "child-1", prompt: "Review", model: explicitModel },
      },
      { resolve: () => {}, reject: () => {} },
    );
    // Explicit-model turns resolve the child model BEFORE recording pending state, so
    // pending appears only after the resolution microtask(s) — poll for it.
    let pending = registry.takePending("child-1");
    for (let attempt = 0; pending === undefined && attempt < 10; attempt += 1) {
      await Promise.resolve();
      pending = registry.takePending("child-1");
    }
    await pending!.resolveLive!("done");
    await turn;

    expect(dispatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "thread.create",
          title: "Review release risks",
          modelSelection: { instanceId: "nexplore", model: "nexplore/coding" },
        }),
        expect.objectContaining({
          type: "thread.turn.start",
          modelSelection: { instanceId: "nexplore", model: "nexplore/coding" },
        }),
      ]),
    );
    expect(permits).toEqual(["acquire", "release", "acquire", "release"]);
    expect(dispatched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "thread.activity.append",
          activity: expect.objectContaining({
            payload: expect.objectContaining({ childTitle: "Review release risks" }),
          }),
        }),
      ]),
    );
  });

  it("settles black-boxed asks live without recording a durable pending entry", async () => {
    const registry = makeWorkflowEngineRegistry();
    const dispatched: OrchestrationCommand[] = [];
    const durablePending: unknown[] = [];
    const resolved: unknown[] = [];
    const broker = createWorkflowEngineBroker({
      runId: "run-1",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: async (command) => {
        dispatched.push(command);
      },
      recordPending: async (pending) => {
        durablePending.push(pending);
      },
      newId: () => "id-1",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

    const send = broker.send(
      {
        correlationId: "run-1:blackbox:1",
        kind: "thread.turn",
        payload: { threadId: "child-1", prompt: "Review this" },
      },
      {
        resolve: (reply) => resolved.push(reply),
        reject: () => {},
      },
    );

    const pending = registry.takePending("child-1");
    for (let attempt = 0; dispatched.length === 0 && attempt < 10; attempt += 1) {
      await Promise.resolve();
    }
    expect(pending?.resolveLive).toBeDefined();
    expect(durablePending).toEqual([]);
    expect(dispatched.map((command) => command.type)).toEqual(["thread.turn.start"]);

    await pending!.resolveLive!({ summary: "Looks good" });
    await send;

    expect(resolved).toEqual([{ summary: "Looks good" }]);
  });

  it("emits BOTH placement halves for a retained child so the sidebar nests it immediately", async () => {
    const dispatched: OrchestrationCommand[] = [];
    let id = 0;
    const broker = createWorkflowEngineBroker({
      runId: "run-nest",
      launchThreadId: "parent-1",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      dispatch: async (command) => void dispatched.push(command),
      newId: () => `id-${++id}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

    await broker.send(
      {
        correlationId: "run-nest:1",
        kind: "thread.create",
        payload: { threadId: "child-1", name: "Risk analysis", retention: "retained" },
      },
      { resolve: () => {}, reject: () => {} },
    );

    const placements = dispatched.filter(
      (command) => command.type === "thread.activity.append",
    ) as Array<Extract<OrchestrationCommand, { type: "thread.activity.append" }>>;
    // handoff.created lands on the CHILD (placement route + child-side reads)...
    const created = placements.find((c) => c.activity.kind === "t3team.handoff.created");
    expect(created).toMatchObject({
      threadId: "child-1",
      activity: {
        payload: {
          parentThreadId: "parent-1",
          childThreadId: "child-1",
          workflowRunId: "run-nest",
        },
      },
    });
    // ...and handoff.started on the PARENT (what indexT3TeamChildParentThreads reads, so the
    // child nests before its own thread detail is ever opened).
    const started = placements.find((c) => c.activity.kind === "t3team.handoff.started");
    expect(started).toMatchObject({
      threadId: "parent-1",
      activity: {
        payload: {
          parentThreadId: "parent-1",
          childThreadId: "child-1",
          childTitle: "Risk analysis",
          workflowRunId: "run-nest",
        },
      },
    });
  });

  it("emits NO placement for a default (ephemeral) child — one-shots never become navigation", async () => {
    const dispatched: OrchestrationCommand[] = [];
    let id = 0;
    const broker = createWorkflowEngineBroker({
      runId: "run-eph",
      launchThreadId: "parent-1",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("instance-1"), "model-1"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      dispatch: async (command) => void dispatched.push(command),
      newId: () => `id-${++id}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });

    await broker.send(
      {
        correlationId: "run-eph:1",
        kind: "thread.create",
        payload: { threadId: "child-1", name: "One shot" },
      },
      { resolve: () => {}, reject: () => {} },
    );

    expect(dispatched.some((command) => command.type === "thread.activity.append")).toBe(false);
  });
});
