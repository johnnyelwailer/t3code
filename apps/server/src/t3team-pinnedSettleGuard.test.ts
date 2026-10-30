import { assert, it } from "@effect/vitest";
import { CommandId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { T3TeamSettleGuardsLive } from "./t3team-childSettleGuards.ts";
import { isUserCommandId } from "./t3team-pinnedSettleGuard.ts";
import {
  createTestThread,
  makeT3TeamV2TestLayer,
} from "./t3team-v2/t3team-v2Orchestrator.testkit.ts";

const TestLayer = makeT3TeamV2TestLayer(
  "t3team-pinned-settle-guard",
  T3TeamSettleGuardsLive.pipe(Layer.provide(SqlitePersistenceMemory), Layer.orDie),
);

let sequence = 0;
const commandId = (prefix: string) => CommandId.make(`${prefix}:${++sequence}`);

const dispatch = (threadId: ThreadId, type: "thread.pin" | "thread.archive", prefix = "user") =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({ type, commandId: commandId(prefix), threadId }),
  );

const settle = (threadId: ThreadId, prefix: string) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({ type: "thread.settle", commandId: commandId(prefix), threadId }),
  ).pipe(Effect.exit);

const shellOf = (threadId: ThreadId) =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.getThreadShell(threadId),
  );

const pinnedThread = (name: string) =>
  Effect.gen(function* () {
    const threadId = ThreadId.make(`thread:pinned:${name}`);
    yield* createTestThread(threadId, name);
    yield* dispatch(threadId, "thread.pin");
    return threadId;
  });

const refusal = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "";

it("only a client command id counts as the user", () => {
  assert.isTrue(isUserCommandId("0d3e5a8c-1f"));
  assert.isFalse(isUserCommandId("mcp:0d3e5a8c-1f"));
  assert.isFalse(isUserCommandId("server:settle-after-run:run-1"));
  assert.isFalse(isUserCommandId("server:auto-settle:thread-1"));
});

it.layer(TestLayer)("pinned settle guard", (it) => {
  it.effect("an agent settle (mcp:) is refused with the pin named, and the pin stays", () =>
    Effect.gen(function* () {
      const threadId = yield* pinnedThread("agent");
      const exit = yield* settle(threadId, "mcp");
      assert.isTrue(Exit.isFailure(exit));
      assert.include(refusal(exit), "is pinned, so only the user can settle it");
      const shell = yield* shellOf(threadId);
      assert.isNotNull(shell?.pinnedAt);
      assert.isNull(shell?.settledOverride ?? null);
    }),
  );

  it.effect("a server settle (auto-settle, task_ops sweep, settle-after-run) is refused", () =>
    Effect.gen(function* () {
      const threadId = yield* pinnedThread("server");
      for (const prefix of [
        "server:auto-settle",
        "server:t3team:children:sweep",
        "server:settle-after-run",
        "server:child-settler:settled-parent",
      ]) {
        assert.isTrue(Exit.isFailure(yield* settle(threadId, prefix)), prefix);
      }
      const shell = yield* shellOf(threadId);
      assert.isNotNull(shell?.pinnedAt);
      assert.isNull(shell?.settledOverride ?? null);
    }),
  );

  it.effect("an unpinned thread still settles for an agent", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread:pinned:unpinned");
      yield* createTestThread(threadId, "unpinned");
      assert.isTrue(Exit.isSuccess(yield* settle(threadId, "mcp")));
      assert.strictEqual((yield* shellOf(threadId))?.settledOverride, "settled");
    }),
  );

  it.effect("the user's own settle still works and is the one thing that unpins", () =>
    Effect.gen(function* () {
      const threadId = yield* pinnedThread("user");
      assert.isTrue(Exit.isSuccess(yield* settle(threadId, "client")));
      const shell = yield* shellOf(threadId);
      assert.strictEqual(shell?.settledOverride, "settled");
      assert.isNull(shell?.pinnedAt ?? null);
    }),
  );

  it.effect("archive and unsettle never alter the pin", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const unsettled = yield* pinnedThread("unsettle");
      yield* orchestrator.dispatch({
        type: "thread.unsettle",
        commandId: commandId("mcp"),
        threadId: unsettled,
        reason: "user",
      });
      assert.isNotNull((yield* shellOf(unsettled))?.pinnedAt);

      const archived = yield* pinnedThread("archive");
      yield* dispatch(archived, "thread.archive", "mcp");
      assert.isNotNull((yield* shellOf(archived))?.pinnedAt);
    }),
  );
});
