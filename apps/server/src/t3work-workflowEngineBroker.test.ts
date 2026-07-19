import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import { createWorkflowEngineBroker } from "./t3work-workflowEngineBroker.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";

describe("createWorkflowEngineBroker", () => {
  it("routes workflow widgets through a typed widget attachment and rejects notifyUser HTML", async () => {
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
        t3workExt: {
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

    await expect(
      broker.send(
        {
          correlationId: "run-widget:2",
          kind: "thread.message",
          payload: {
            threadId: "parent-1",
            recipient: "user",
            text: "<div>unsafe raw widget</div>",
          },
        },
        { resolve: () => {}, reject: () => {} },
      ),
    ).rejects.toThrow("notifyUser accepts plain text only");
    expect(dispatched).toHaveLength(1);
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
    const pending = registry.takePending("child-1");
    for (let attempt = 0; dispatched.length === 0 && attempt < 10; attempt += 1) {
      await Promise.resolve();
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
});
