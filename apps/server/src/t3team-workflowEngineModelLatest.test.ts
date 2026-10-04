import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, expect } from "vite-plus/test";
import {
  ProjectId,
  ProviderInstanceId,
  type OrchestrationCommand,
  type ServerProvider,
} from "@t3tools/contracts";
import { createMockBroker, createThreadPrimitives, type HandleDispatch } from "@t3team/sdk";

import { setChildProviderCatalog } from "./t3team-childProviderCatalog.ts";
import { createWorkflowEngineBroker } from "./t3team-workflowEngineBroker.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { toWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";

const base = { instanceId: ProviderInstanceId.make("parent"), model: "retired", options: [] };
const makeProvider = (instanceId: string): ServerProvider =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: [
      { slug: "retired", name: "Retired", isCustom: false, capabilities: null, isLegacy: true },
      { slug: "first", name: "First", isCustom: false, capabilities: null },
      { slug: "declared", name: "Declared", isCustom: false, capabilities: null, isDefault: true },
    ],
  }) as unknown as ServerProvider;

function harness() {
  const commands: OrchestrationCommand[] = [];
  let id = 0;
  const broker = createWorkflowEngineBroker({
    runId: "run",
    launchThreadId: "launch",
    projectId: ProjectId.make("project"),
    modelSelection: base,
    runtimeMode: "full-access",
    interactionMode: "default",
    registry: makeWorkflowEngineRegistry(),
    dispatch: async (command) => {
      commands.push(command);
    },
    newId: () => `id-${++id}`,
    nowIso: () => "2026-10-04T00:00:00.000Z",
  });
  const send = (kind: "thread.create" | "thread.turn", payload: unknown) =>
    broker.send(
      { correlationId: `run:${++id}`, kind, payload },
      { resolve: () => {}, reject: () => {} },
    );
  return { commands, broker, send };
}

afterEach(() => setChildProviderCatalog(undefined));

for (const model of [undefined, "parent", "parent/first", "parent/retired"]) {
  it.effect(`routes workflow create and turn model ${String(model)} through the live catalog`, () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [makeProvider("parent")]);
      const h = harness();
      const opts = model === undefined ? {} : { model };
      yield* Effect.tryPromise(() =>
        h.send("thread.create", { threadId: "child", name: "Review", ...opts }),
      );
      yield* Effect.tryPromise(() =>
        h.send("thread.turn", { threadId: "child", prompt: "review", ...opts }),
      );
      const expected = model?.split("/")[1] ?? "declared";
      for (const type of ["thread.create", "thread.turn.start"]) {
        expect(h.commands).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type,
              modelSelection: expect.objectContaining({ instanceId: "parent", model: expected }),
            }),
          ]),
        );
      }
    }),
  );
}

it.effect(
  "runs an author-omitted model on the host policy instance's latest through SDK and broker",
  () =>
    Effect.gen(function* () {
      setChildProviderCatalog(async () => [makeProvider("parent"), makeProvider("policy")]);
      const h = harness();
      const replies = new Map<string, unknown>();
      let seq = 0;
      const dispatch: HandleDispatch = {
        send: async (call) => {
          const id = `run:${++seq}`;
          await call.fire(id, { resolve: (r) => replies.set(id, r), reject: () => {} });
          return id;
        },
        sendOneWay: (call) => {
          const id = `run:${++seq}`;
          void call.fire(id, { resolve: () => {}, reject: () => {} });
          return id;
        },
        awaitResolution: async <R>(id: string) => replies.get(id) as R,
      };
      const replyBroker = createMockBroker(() => ({ kind: "resolve", reply: "done" }));
      const primitives = createThreadPrimitives({
        dispatch,
        capabilities: new Set(),
        launchThreadId: "launch",
        defaultModel: toWorkflowModelSelection({
          instanceId: ProviderInstanceId.make("policy"),
          model: "retired",
        }),
        broker: {
          send: async (e, r) => {
            await h.broker.send(e, r);
            await replyBroker.send(e, r);
          },
        },
      });
      yield* Effect.tryPromise(() => primitives.agent("review", { capabilities: "inherit" }));
      for (const type of ["thread.create", "thread.turn.start"]) {
        expect(h.commands).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type,
              modelSelection: expect.objectContaining({ instanceId: "policy", model: "declared" }),
            }),
          ]),
        );
      }
    }),
);

it.effect("keeps the user's launch thread on its current model", () =>
  Effect.gen(function* () {
    setChildProviderCatalog(async () => [makeProvider("parent")]);
    const h = harness();
    yield* Effect.tryPromise(() =>
      h.send("thread.turn", {
        threadId: "launch",
        prompt: "stale default",
        model: toWorkflowModelSelection(base),
        modelIsDefault: true,
      }),
    );
    const replies = new Map<string, unknown>();
    let seq = 0;
    const dispatch: HandleDispatch = {
      send: async (call) => {
        const id = `run:${++seq}`;
        await call.fire(id, { resolve: (r) => replies.set(id, r), reject: () => {} });
        return id;
      },
      sendOneWay: (call) => {
        const id = `run:${++seq}`;
        void call.fire(id, { resolve: () => {}, reject: () => {} });
        return id;
      },
      awaitResolution: async <R>(id: string) => replies.get(id) as R,
    };
    const replyBroker = createMockBroker(() => ({ kind: "resolve", reply: "done" }));
    const primitives = createThreadPrimitives({
      dispatch,
      capabilities: new Set(),
      launchThreadId: "launch",
      defaultModel: toWorkflowModelSelection(base),
      broker: {
        send: async (e, r) => {
          await h.broker.send(e, r);
          await replyBroker.send(e, r);
        },
      },
    });
    yield* Effect.tryPromise(() => primitives.thread!.askAgent("Review the launch thread"));
    const launchTurns = h.commands.filter(
      (command) => command.type === "thread.turn.start" && command.threadId === "launch",
    );
    expect(launchTurns).toHaveLength(2);
    for (const command of launchTurns) {
      expect(command).toMatchObject({
        modelSelection: expect.objectContaining({ instanceId: "parent", model: "retired" }),
      });
    }
  }),
);
