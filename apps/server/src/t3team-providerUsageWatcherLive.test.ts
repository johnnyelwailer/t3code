/**
 * Wiring of the live provider usage watcher layer: it consumes
 * `ProviderRegistry.streamChanges` + `ProviderService.streamEvents` (no
 * sampler of its own) and its deadline loop replays a due hold under
 * TestClock. Also pins the hold repository's claim semantics.
 */
import { assert, describe, it } from "@effect/vitest";
import type {
  OrchestrationCommand,
  OrchestrationThread,
  ProviderRuntimeEvent,
  ServerProvider,
} from "@t3tools/contracts";
import { MessageId, ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderUsageHoldRepositoryLive } from "./persistence/Layers/t3team-ProviderUsageHolds.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { ProviderUsageHoldRepository } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import { T3TeamProviderUsageWatcherLive } from "./t3team-providerUsageWatcher.ts";
import {
  PROVIDER_USAGE_DEADLINE_CHECK_MS,
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  PROVIDER_USAGE_RESUME_GRACE_MS,
} from "./t3team-providerUsageWatcherTypes.ts";

const NOW = Date.parse("2026-09-28T10:00:00.000Z");
const iso = (offsetMs: number) => DateTime.formatIso(DateTime.makeUnsafe(NOW + offsetMs));
const RESET_IN_MS = 30 * 60_000;

const exhausted = {
  instanceId: "claude_work",
  driver: "claudeAgent",
  usageLimits: {
    checkedAt: iso(0),
    windows: [
      {
        id: "five_hour",
        kind: "session",
        label: "Session",
        usedPercent: 100,
        resetsAt: iso(RESET_IN_MS),
      },
    ],
  },
} as unknown as ServerProvider;

const failedThread = {
  id: "t1",
  session: { providerInstanceId: "claude_work", providerName: "claudeAgent" },
  latestTurn: null,
  messages: [{ id: "m1", role: "user", createdAt: iso(-1_000) }],
} as unknown as OrchestrationThread;

describe("T3TeamProviderUsageWatcherLive", () => {
  it.effect(
    "follows the registry + runtime streams and replays a due hold on its deadline tick",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW);
        const snapshots = yield* Queue.unbounded<ReadonlyArray<ServerProvider>>();
        const events = yield* Queue.unbounded<ProviderRuntimeEvent>();
        const held = yield* Deferred.make<void>();
        const resumed = yield* Deferred.make<OrchestrationCommand>();
        const dispatch = (command: OrchestrationCommand) =>
          Effect.gen(function* () {
            if (
              command.type === "thread.activity.append" &&
              command.activity.kind === PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.started
            ) {
              yield* Deferred.succeed(held, undefined);
            }
            if (command.type === "thread.turn.resume") yield* Deferred.succeed(resumed, command);
            return { sequence: 1 };
          });
        const layer = T3TeamProviderUsageWatcherLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.mock(ProviderRegistry)({
                getProviders: Effect.succeed([]),
                streamChanges: Stream.fromQueue(snapshots),
              }),
              Layer.mock(ProviderService)({ streamEvents: Stream.fromQueue(events) }),
              Layer.mock(OrchestrationEngineService)({ dispatch }),
              Layer.mock(ProjectionSnapshotQuery)({
                getThreadDetailById: () => Effect.succeed(Option.some(failedThread)),
              }),
            ),
          ),
          Layer.provideMerge(SqlitePersistenceMemory),
        );
        yield* Effect.gen(function* () {
          yield* Queue.offer(snapshots, [exhausted]);
          yield* Queue.offer(events, {
            type: "turn.completed",
            eventId: "e1",
            provider: "claudeAgent",
            providerInstanceId: "claude_work",
            threadId: "t1",
            createdAt: iso(0),
            payload: { state: "failed", failureKind: "usage_limit" },
          } as unknown as ProviderRuntimeEvent);
          yield* Deferred.await(held);
          const holds = yield* ProviderUsageHoldRepository;
          const row = Option.getOrThrow(
            yield* holds.getByThreadId({ threadId: ThreadId.make("t1") }),
          );
          assert.strictEqual(row.resetsAt, iso(RESET_IN_MS));

          yield* TestClock.adjust(
            RESET_IN_MS + PROVIDER_USAGE_RESUME_GRACE_MS + PROVIDER_USAGE_DEADLINE_CHECK_MS,
          );
          const command = yield* Deferred.await(resumed);
          assert.strictEqual(
            command.type === "thread.turn.resume" ? String(command.messageId) : "",
            "m1",
          );
          assert.strictEqual((yield* holds.listActive()).length, 0);
        }).pipe(Effect.provide(layer));
      }),
  );
});

describe("ProviderUsageHoldRepository", () => {
  const hold = {
    threadId: ThreadId.make("t1"),
    provider: ProviderDriverKind.make("claudeAgent"),
    providerInstanceId: ProviderInstanceId.make("claude_work"),
    since: iso(0),
    resetsAt: iso(RESET_IN_MS),
    autoResume: true,
    pendingTurnMessageId: MessageId.make("m1"),
    releasedAt: null,
    releaseReason: null,
    updatedAt: iso(0),
  };

  it.effect("markReleased is a claim: only the first caller gets the row", () =>
    Effect.gen(function* () {
      const holds = yield* ProviderUsageHoldRepository;
      yield* holds.upsertActiveHold(hold);
      const first = yield* holds.markReleased({
        threadId: hold.threadId,
        reason: "a",
        now: iso(1),
      });
      const second = yield* holds.markReleased({
        threadId: hold.threadId,
        reason: "b",
        now: iso(2),
      });
      assert.isTrue(Option.isSome(first));
      assert.isTrue(Option.isNone(second));
    }).pipe(
      Effect.provide(ProviderUsageHoldRepositoryLive.pipe(Layer.provide(SqlitePersistenceMemory))),
    ),
  );

  it.effect("re-recording keeps the user's toggle while active, re-arms after release", () =>
    Effect.gen(function* () {
      const holds = yield* ProviderUsageHoldRepository;
      yield* holds.upsertActiveHold(hold);
      yield* holds.setAutoResume({ threadId: hold.threadId, autoResume: false, now: iso(1) });
      yield* holds.upsertActiveHold({ ...hold, pendingTurnMessageId: MessageId.make("m2") });
      const active = Option.getOrThrow(yield* holds.getByThreadId({ threadId: hold.threadId }));
      assert.strictEqual(active.autoResume, false);
      assert.strictEqual(active.pendingTurnMessageId, "m2");

      yield* holds.markReleased({ threadId: hold.threadId, reason: "reset", now: iso(2) });
      yield* holds.upsertActiveHold({
        ...hold,
        since: iso(3),
        pendingTurnMessageId: MessageId.make("m3"),
      });
      const rearmed = Option.getOrThrow(yield* holds.getByThreadId({ threadId: hold.threadId }));
      assert.strictEqual(rearmed.autoResume, true);
      assert.strictEqual(rearmed.since, iso(3));
      assert.strictEqual(rearmed.pendingTurnMessageId, "m3");
      assert.strictEqual(rearmed.releasedAt, null);
    }).pipe(
      Effect.provide(ProviderUsageHoldRepositoryLive.pipe(Layer.provide(SqlitePersistenceMemory))),
    ),
  );
});
