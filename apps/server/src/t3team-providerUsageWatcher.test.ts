/**
 * Behaviour of the provider usage watcher against the real SQLite hold
 * repository: never gate a send, record usage-limited failures per provider
 * INSTANCE, replay once after the reset, never replay an answered turn.
 */
import { assert, describe, it } from "@effect/vitest";
import type {
  OrchestrationCommand,
  OrchestrationThread,
  ProviderRuntimeEvent,
  ServerProvider,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ProviderUsageHoldRepositoryLive } from "./persistence/Layers/t3team-ProviderUsageHolds.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { ProviderUsageHoldRepository } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import { makeProviderUsageWatcher } from "./t3team-providerUsageWatcher.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  PROVIDER_USAGE_RESUME_GRACE_MS,
} from "./t3team-providerUsageWatcherTypes.ts";

const NOW = Date.parse("2026-09-28T10:00:00.000Z");
const iso = (offsetMs: number) => DateTime.formatIso(DateTime.makeUnsafe(NOW + offsetMs));
const RESETS_AT = iso(60 * 60_000);

const TestLayer = ProviderUsageHoldRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory));

const sessionWindow = (usedPercent: number, resetsAt = RESETS_AT): ServerProviderUsageWindow => ({
  id: "five_hour",
  kind: "session",
  label: "Session",
  usedPercent,
  resetsAt,
});

const provider = (
  instanceId: string,
  windows: ReadonlyArray<ServerProviderUsageWindow>,
  checkedAtOffsetMs = 0,
): ServerProvider =>
  ({
    instanceId,
    driver: "claudeAgent",
    usageLimits: { checkedAt: iso(checkedAtOffsetMs), windows },
  }) as unknown as ServerProvider;

const thread = (input: {
  readonly id: string;
  readonly instanceId: string;
  readonly latestTurn?: OrchestrationThread["latestTurn"];
  readonly extraMessages?: ReadonlyArray<{ readonly id: string; readonly role: string }>;
}): OrchestrationThread =>
  ({
    id: input.id,
    session: { providerInstanceId: input.instanceId, providerName: "claudeAgent" },
    latestTurn: input.latestTurn ?? null,
    messages: [
      { id: `${input.id}-m1`, role: "user", createdAt: iso(-1_000) },
      ...(input.extraMessages ?? []).map((message) => ({ ...message, createdAt: iso(0) })),
    ],
  }) as unknown as OrchestrationThread;

const turnCompleted = (input: {
  readonly threadId: string;
  readonly instanceId: string;
  readonly state: "completed" | "failed";
  readonly failureKind?: "usage_limit";
}): ProviderRuntimeEvent =>
  ({
    type: "turn.completed",
    eventId: `evt-${input.threadId}`,
    provider: "claudeAgent",
    providerInstanceId: input.instanceId,
    threadId: input.threadId,
    createdAt: iso(0),
    payload: {
      state: input.state,
      ...(input.failureKind ? { failureKind: input.failureKind } : {}),
    },
  }) as unknown as ProviderRuntimeEvent;

/** Real repo, fake engine + thread query. Returns the watcher and what it dispatched. */
const setup = (threads: ReadonlyArray<OrchestrationThread>) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW);
    const sql = yield* SqlClient.SqlClient;
    for (const item of threads) {
      yield* sql`
        INSERT INTO projection_thread_sessions (thread_id, status, provider_name, provider_instance_id, updated_at)
        VALUES (${item.id}, 'ready', 'claudeAgent', ${item.session?.providerInstanceId ?? null}, ${iso(0)})
      `;
    }
    const byId = new Map(threads.map((item) => [item.id as string, item]));
    const dispatched: Array<OrchestrationCommand> = [];
    const holds = yield* ProviderUsageHoldRepository;
    const watcher = yield* makeProviderUsageWatcher({
      engine: {
        dispatch: (command) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
      },
      query: {
        getThreadDetailById: (id) => Effect.succeed(Option.fromNullishOr(byId.get(id))),
      },
      holds,
      devForceEnabled: false,
    });
    const resumes = () => dispatched.filter((command) => command.type === "thread.turn.resume");
    const activities = (kind: string) =>
      dispatched.flatMap((command) =>
        command.type === "thread.activity.append" && command.activity.kind === kind
          ? [command]
          : [],
      );
    return { watcher, holds, dispatched, resumes, activities, byId };
  });

describe("provider usage watcher", () => {
  it.effect(
    "records a usage-limited failure per instance and replays it once after the reset",
    () =>
      Effect.gen(function* () {
        const t = yield* setup([thread({ id: "t1", instanceId: "claude_work" })]);
        yield* t.watcher.applyProviders([provider("claude_work", [sessionWindow(100)])]);
        yield* t.watcher.onRuntimeEvent(
          turnCompleted({
            threadId: "t1",
            instanceId: "claude_work",
            state: "failed",
            failureKind: "usage_limit",
          }),
        );
        const row = Option.getOrThrow(
          yield* t.holds.getByThreadId({ threadId: ThreadId.make("t1") }),
        );
        assert.strictEqual(row.providerInstanceId, "claude_work");
        assert.strictEqual(row.pendingTurnMessageId, "t1-m1");
        assert.strictEqual(row.resetsAt, RESETS_AT);
        assert.strictEqual(t.activities(PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started).length, 1);

        yield* t.watcher.releaseDue();
        assert.strictEqual(t.resumes().length, 0, "nothing replays before the reset");

        yield* TestClock.adjust(60 * 60_000 + PROVIDER_USAGE_RESUME_GRACE_MS);
        yield* t.watcher.releaseDue();
        yield* t.watcher.releaseDue();
        assert.strictEqual(t.resumes().length, 1, "replayed exactly once");
        assert.deepStrictEqual(
          t
            .resumes()
            .map((command) =>
              command.type === "thread.turn.resume" ? String(command.messageId) : "",
            ),
          ["t1-m1"],
        );
        assert.strictEqual((yield* t.holds.listActive()).length, 0);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("never records a hold for an ordinary failure with no exhausted window", () =>
    Effect.gen(function* () {
      const t = yield* setup([thread({ id: "t1", instanceId: "claude_work" })]);
      yield* t.watcher.applyProviders([provider("claude_work", [sessionWindow(40)])]);
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({ threadId: "t1", instanceId: "claude_work", state: "failed" }),
      );
      assert.strictEqual((yield* t.holds.listActive()).length, 0);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("records a failure sent while the instance's window was exhausted", () =>
    Effect.gen(function* () {
      const t = yield* setup([thread({ id: "t1", instanceId: "claude_work" })]);
      yield* t.watcher.applyProviders([provider("claude_work", [sessionWindow(100)])]);
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({ threadId: "t1", instanceId: "claude_work", state: "failed" }),
      );
      assert.strictEqual((yield* t.holds.listActive()).length, 1);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("keys by instance: another account of the same driver is unaffected", () =>
    Effect.gen(function* () {
      const t = yield* setup([
        thread({ id: "t1", instanceId: "claude_work" }),
        thread({ id: "t2", instanceId: "claude_home" }),
      ]);
      yield* t.watcher.applyProviders([
        provider("claude_work", [sessionWindow(100)]),
        provider("claude_home", [sessionWindow(10)]),
      ]);
      // Same driver, other instance: not exhausted, no structured limit → no hold.
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({ threadId: "t2", instanceId: "claude_home", state: "failed" }),
      );
      assert.strictEqual((yield* t.holds.listActive()).length, 0);
      const warned = t
        .activities(PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warning)
        .map((command) =>
          command.type === "thread.activity.append" ? String(command.threadId) : "",
        );
      assert.deepStrictEqual(warned, ["t1"], "only the exhausted instance's thread is warned");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("does not replay a turn that was answered in the meantime (also after restart)", () =>
    Effect.gen(function* () {
      const t = yield* setup([thread({ id: "t1", instanceId: "claude_work" })]);
      yield* t.watcher.applyProviders([provider("claude_work", [sessionWindow(100)])]);
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({
          threadId: "t1",
          instanceId: "claude_work",
          state: "failed",
          failureKind: "usage_limit",
        }),
      );
      // The user pressed Continue by hand and it completed; the host restarts
      // before the completion event is observed (a fresh watcher over the rows).
      t.byId.set(
        "t1",
        thread({
          id: "t1",
          instanceId: "claude_work",
          latestTurn: {
            turnId: "turn-2",
            state: "completed",
            requestedAt: iso(5_000),
            startedAt: iso(5_000),
            completedAt: iso(9_000),
            assistantMessageId: null,
          } as unknown as OrchestrationThread["latestTurn"],
          extraMessages: [{ id: "t1-a1", role: "assistant" }],
        }),
      );
      const restarted = yield* makeProviderUsageWatcher({
        engine: {
          dispatch: (command) =>
            Effect.sync(() => {
              t.dispatched.push(command);
              return { sequence: t.dispatched.length };
            }),
        },
        query: {
          getThreadDetailById: (id) => Effect.succeed(Option.fromNullishOr(t.byId.get(id))),
        },
        holds: t.holds,
        devForceEnabled: false,
      });
      yield* TestClock.adjust(60 * 60_000 + PROVIDER_USAGE_RESUME_GRACE_MS);
      yield* restarted.releaseDue();
      assert.strictEqual(t.resumes().length, 0);
      assert.strictEqual((yield* t.holds.listActive()).length, 0, "the hold is still released");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("clears the hold without a replay when a later turn completes", () =>
    Effect.gen(function* () {
      const t = yield* setup([thread({ id: "t1", instanceId: "claude_work" })]);
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({
          threadId: "t1",
          instanceId: "claude_work",
          state: "failed",
          failureKind: "usage_limit",
        }),
      );
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({ threadId: "t1", instanceId: "claude_work", state: "completed" }),
      );
      assert.strictEqual((yield* t.holds.listActive()).length, 0);
      yield* TestClock.adjust(24 * 60 * 60_000);
      yield* t.watcher.releaseDue();
      assert.strictEqual(t.resumes().length, 0);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("replays early when a fresh snapshot shows the instance recovered", () =>
    Effect.gen(function* () {
      const t = yield* setup([thread({ id: "t1", instanceId: "claude_work" })]);
      yield* t.watcher.applyProviders([provider("claude_work", [sessionWindow(100)])]);
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({
          threadId: "t1",
          instanceId: "claude_work",
          state: "failed",
          failureKind: "usage_limit",
        }),
      );
      yield* TestClock.adjust(10 * 60_000);
      // Missing data never releases.
      yield* t.watcher.applyProviders([
        {
          ...provider("claude_work", []),
          usageLimits: {
            checkedAt: iso(10 * 60_000),
            windows: [],
            unavailable: { reason: "probeFailed" },
          },
        } as ServerProvider,
      ]);
      assert.strictEqual(t.resumes().length, 0);
      yield* t.watcher.applyProviders([
        provider("claude_work", [sessionWindow(3, iso(5 * 60 * 60_000))], 10 * 60_000),
      ]);
      assert.strictEqual(t.resumes().length, 1);
      assert.strictEqual(t.activities(PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.warningCleared).length, 1);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("does not replay when the user sent a newer message", () =>
    Effect.gen(function* () {
      const t = yield* setup([thread({ id: "t1", instanceId: "claude_work" })]);
      yield* t.watcher.applyProviders([provider("claude_work", [sessionWindow(100)])]);
      yield* t.watcher.onRuntimeEvent(
        turnCompleted({
          threadId: "t1",
          instanceId: "claude_work",
          state: "failed",
          failureKind: "usage_limit",
        }),
      );
      t.byId.set(
        "t1",
        thread({
          id: "t1",
          instanceId: "claude_work",
          extraMessages: [{ id: "t1-m2", role: "user" }],
        }),
      );
      yield* TestClock.adjust(60 * 60_000 + PROVIDER_USAGE_RESUME_GRACE_MS);
      yield* t.watcher.releaseDue();
      assert.strictEqual(t.resumes().length, 0);
      assert.strictEqual((yield* t.holds.listActive()).length, 0, "the hold was due and released");
    }).pipe(Effect.provide(TestLayer)),
  );
});
