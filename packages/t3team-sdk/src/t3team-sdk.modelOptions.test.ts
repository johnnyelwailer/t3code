import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { HandleDispatch } from "@runbook/core/handles";
import { canonicalJsonStringify, hashArgs } from "@runbook/core/canonicalJson";
import { createMockBroker, createThreadPrimitives, defineModel } from "@runbook/threads";
import type { ModelSelection } from "@runbook/threads/models";

const inherited: ModelSelection = {
  provider: "primary",
  model: defineModel({ provider: "driver", id: "old-model" }),
};

function harness(defaultModel: ModelSelection | undefined = inherited) {
  const args: Array<{ kind: string; args: unknown }> = [];
  const replies = new Map<string, unknown>();
  const broker = createMockBroker(() => ({ kind: "resolve", reply: "done" }));
  const dispatch: HandleDispatch = {
    send: async (call) => {
      args.push({ kind: call.kind, args: call.args });
      const id = `run:${args.length}`;
      await call.fire(id, { resolve: (reply) => replies.set(id, reply), reject: () => {} });
      return id;
    },
    sendOneWay: (call) => {
      args.push({ kind: call.kind, args: call.args });
      const id = `run:${args.length}`;
      void call.fire(id, { resolve: () => {}, reject: () => {} });
      return id;
    },
    awaitResolution: async <R>(id: string) => replies.get(id) as R,
  };
  const primitives = createThreadPrimitives({
    dispatch,
    broker,
    defaultModel,
    launchThreadId: "launch",
    capabilities: new Set(["user"]),
  });
  return { ...primitives, args, broker };
}

for (const model of ["primary/model-a", "primary", "primary/vendor/model-a"]) {
  it.effect(`accepts model: "${model}" on agent, spawnThread and thread turns with effort`, () =>
    Effect.gen(function* () {
      const h = harness();
      yield* Effect.tryPromise(() =>
        h.agent("review", { capabilities: "inherit", model, effort: "high" }),
      );
      const child = h.spawnThread({ capabilities: "inherit", model, effort: "light" });
      yield* Effect.tryPromise(() => child.askAgent("summarize"));
      yield* Effect.tryPromise(() => h.thread!.askAgent("judge", { model, effort: "standard" }));
      assert.deepStrictEqual(
        h.broker.sent.map((e) => (e.payload as { model: unknown }).model),
        [model, model, model, model, model],
      );
      assert.deepStrictEqual(
        h.broker.sent.map((e) => (e.payload as { effort: unknown }).effort),
        ["high", "high", "light", "light", "standard"],
      );
      for (const envelope of h.broker.sent) {
        assert.notProperty(envelope.payload, "modelIsDefault");
      }
    }),
  );
}

it.effect("marks injected defaults only in broker payloads and keeps historical turn args", () =>
  Effect.gen(function* () {
    const h = harness();
    const child = h.spawnThread({ capabilities: "inherit", name: "Review" });
    yield* Effect.tryPromise(() => child.askAgent("review"));
    yield* Effect.tryPromise(() => h.thread!.askAgent("judge"));
    const [created, childTurn, launchTurn] = h.broker.sent;
    assert.propertyVal(created?.payload, "modelIsDefault", true);
    assert.propertyVal(childTurn?.payload, "modelIsDefault", true);
    assert.notProperty(launchTurn?.payload, "modelIsDefault");
    assert.deepStrictEqual(
      (launchTurn?.payload as { model?: unknown } | undefined)?.model,
      inherited,
    );
    const historical = { threadId: "run:1", prompt: "review", model: inherited };
    assert.strictEqual(JSON.stringify(h.args[1]?.args), JSON.stringify(historical));
    assert.strictEqual(canonicalJsonStringify(h.args[1]?.args), canonicalJsonStringify(historical));
    assert.strictEqual(hashArgs(h.args[1]?.args), hashArgs(historical));
    assert.deepStrictEqual(h.args[0]?.args, { name: "Review", retention: "ephemeral" });
    assert.deepStrictEqual(h.args[2]?.args, {
      threadId: "launch",
      prompt: "judge",
      model: inherited,
    });
    for (const call of h.args) assert.notProperty(call.args, "modelIsDefault");
  }),
);

it.effect("keeps an explicit legacy object and its provider metadata byte-identical", () =>
  Effect.gen(function* () {
    const h = harness();
    const child = h.spawnThread({ capabilities: "inherit", model: inherited, effort: "high" });
    yield* Effect.tryPromise(() => child.askAgent("review"));
    const historical = { threadId: "run:1", prompt: "review", model: inherited, effort: "high" };
    assert.strictEqual(JSON.stringify(h.args[1]?.args), JSON.stringify(historical));
    assert.strictEqual(hashArgs(h.args[1]?.args), hashArgs(historical));
    for (const envelope of h.broker.sent) assert.notProperty(envelope.payload, "modelIsDefault");
  }),
);
