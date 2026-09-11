/**
 * Inter-agent coalescing (GHE #153): a burst of delivered actor messages for
 * one thread must drain into ONE reaction turn, not one turn per message.
 *
 * `it.effect` installs the test clock. This module pins a 50ms window via env
 * (a stand-in for the 45s idle default — same clock-driven pattern) so the
 * tests can prove window/coalescing behavior in virtual time, and one test
 * unsets the pin to prove the real default is 45s. No real waiting anywhere;
 * the settle checks prove no extra turn follows the expected one.
 */
import type {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationThread,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import { T3TeamActorMessageReactorLive } from "./t3team-actorMessageReactor.ts";
import {
  resolveActorMessageDebounceMs,
  T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS,
} from "./t3team-actorMessageReactorLimits.ts";
import {
  buildActorReactionBatchInput,
  buildActorReactionInput,
} from "./t3team-actorReactionInput.ts";

const DEBOUNCE_ENV = "T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS";
const ORIGINAL_DEBOUNCE = process.env[DEBOUNCE_ENV];

// Pin a 50ms window for the clock-driven tests in THIS FILE (the real default
// is the 45s idle window, proven by its own dedicated test). Re-pinned before
// EVERY test: the afterEach below restores the caller's env, so without this
// the later tests would run against the 45s default and the virtual clock
// (10s horizon) would never reach the claim.
beforeEach(() => {
  process.env[DEBOUNCE_ENV] = "50";
});

afterEach(() => {
  if (ORIGINAL_DEBOUNCE === undefined) delete process.env[DEBOUNCE_ENV];
  else process.env[DEBOUNCE_ENV] = ORIGINAL_DEBOUNCE;
});

const idleThread = {
  id: ThreadId.make("target"),
  session: { status: "idle" },
  latestTurn: null,
  modelSelection: null,
  runtimeMode: null,
  interactionMode: null,
  // The real loadThread is getThreadDetailById: the detail projection carries
  // both, and startActorReaction reads them (user-return + human-steering
  // context, parent lookup via handoff activities).
  messages: [],
  activities: [],
} as unknown as OrchestrationThread;

const entryFor = (
  messageId: string,
  urgency: "normal" | "urgent" = "normal",
): T3TeamActorMailboxEntry => ({
  messageId,
  fromThreadId: `sender-${messageId}`,
  fromTitle: `Sender ${messageId}`,
  fromProjectId: "project",
  text: `body ${messageId}`,
  urgency,
  hopCount: 1,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
});

const delivery = (messageId: string, urgency: "normal" | "urgent" = "normal"): OrchestrationEvent =>
  ({
    type: "thread.actor-message-delivered",
    payload: { threadId: "target", ...entryFor(messageId, urgency) },
  }) as unknown as OrchestrationEvent;

const sessionSet = (status: string): OrchestrationEvent =>
  ({
    type: "thread.session-set",
    payload: {
      threadId: "target",
      session: { status },
      createdAt: "2026-07-19T08:00:00.000Z",
    },
  }) as unknown as OrchestrationEvent;

type TurnStart = Extract<OrchestrationCommand, { type: "thread.turn.start" }>;

const makeEngine = (
  eventStream: Stream.Stream<OrchestrationEvent>,
  dispatches: TurnStart[],
): OrchestrationEngineShape =>
  ({
    streamDomainEvents: eventStream,
    readEvents: () => Stream.empty,
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        dispatches.push(command as TurnStart);
      }),
  }) as unknown as OrchestrationEngineShape;

const makeLayer = (engine: OrchestrationEngineShape) =>
  T3TeamActorMessageReactorLive.pipe(
    Layer.provideMerge(Layer.succeed(OrchestrationEngineService, engine)),
    Layer.provideMerge(
      Layer.succeed(ProjectionSnapshotQuery, {
        getThreadDetailById: () => Effect.succeed(Option.some(idleThread)),
      } as unknown as ProjectionSnapshotQueryShape),
    ),
    // The reactor's declared event-handler context names SqlClient (the real
    // loadThread path needs it); the fakes never call it, so an empty stand-in
    // satisfies the context.
    Layer.provideMerge(Layer.succeed(SqlClient.SqlClient, {} as never)),
  );

/** The dispatch at `index`, or a hard test failure if it never happened. */
const turnAt = (dispatches: TurnStart[], index: number): TurnStart => {
  const turn = dispatches[index];
  if (turn === undefined) {
    throw new Error(`expected a dispatch at index ${index}, got ${dispatches.length}`);
  }
  return turn;
};

/** Advance the test clock until `count` dispatches landed (or virtual time runs out). */
const waitForDispatches = (dispatches: TurnStart[], count: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < 200 && dispatches.length < count; i += 1) {
      yield* TestClock.adjust("50 millis");
      yield* Effect.yieldNow;
    }
    expect(dispatches.length).toBeGreaterThanOrEqual(count);
  });

/** Advance the clock a while further and prove no extra turn followed. */
const settle = (dispatches: TurnStart[]) =>
  Effect.gen(function* () {
    const seen = dispatches.length;
    for (let i = 0; i < 10; i += 1) {
      yield* TestClock.adjust("50 millis");
      yield* Effect.yieldNow;
    }
    expect(dispatches.length).toBe(seen);
  });

describe("T3TeamActorMessageReactorLive (coalescing)", () => {
  it.effect("coalesces a burst of deliveries into ONE reaction turn", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const engine = makeEngine(
        Stream.fromIterable([delivery("m1"), delivery("m2"), delivery("m3")]),
        dispatches,
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(makeLayer(engine));
          yield* waitForDispatches(dispatches, 1);
          yield* settle(dispatches);
        }),
      );

      expect(dispatches).toHaveLength(1);
      const turn = turnAt(dispatches, 0);
      expect(turn.type).toBe("thread.turn.start");
      expect(turn.threadId).toBe("target");
      expect(turn.message.text).toBe(
        buildActorReactionBatchInput([entryFor("m1"), entryFor("m2"), entryFor("m3")]),
      );
      expect(turn.message.t3teamExt?.visibleToUser).toBe(false);
      expect(turn.message.t3teamExt?.actor).toEqual({
        senderThreadId: "sender-m1",
        urgency: "normal",
        hopCount: 1,
        rootThreadId: "root",
        messageIds: ["m1", "m2", "m3"],
      });
    }),
  );

  it.effect("keeps single-message delivery semantics unchanged", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const engine = makeEngine(Stream.fromIterable([delivery("m1")]), dispatches);

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(makeLayer(engine));
          yield* waitForDispatches(dispatches, 1);
          yield* settle(dispatches);
        }),
      );

      expect(dispatches).toHaveLength(1);
      const turn = turnAt(dispatches, 0);
      // Byte-identical to the historical single-message framing, and no
      // batch metadata is attached.
      expect(turn.message.text).toBe(buildActorReactionInput(entryFor("m1")));
      expect(turn.message.t3teamExt?.actor).toEqual({
        senderThreadId: "sender-m1",
        urgency: "normal",
        hopCount: 1,
        rootThreadId: "root",
      });
    }),
  );

  it.effect("a delivery after the window flushes the NEXT batch", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const release = yield* Deferred.make<void>();
      // m1 lands first; once its reaction turn has been dispatched, m2 is
      // released — well after the 50ms window, so it must not join the first
      // turn but flush its own.
      const eventStream = Stream.concat(
        Stream.fromIterable([delivery("m1")]),
        Stream.fromEffect(Deferred.await(release)).pipe(
          Stream.flatMap(() => Stream.fromIterable([sessionSet("idle"), delivery("m2")])),
        ),
      );
      const engine = makeEngine(eventStream, dispatches);

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(makeLayer(engine));
          yield* waitForDispatches(dispatches, 1);
          yield* Deferred.succeed(release, undefined);
          yield* waitForDispatches(dispatches, 2);
          yield* settle(dispatches);
        }),
      );

      expect(dispatches).toHaveLength(2);
      expect(turnAt(dispatches, 0).message.text).toBe(buildActorReactionInput(entryFor("m1")));
      expect(turnAt(dispatches, 1).message.text).toBe(buildActorReactionInput(entryFor("m2")));
      expect(turnAt(dispatches, 0).message.t3teamExt?.actor?.messageIds).toBeUndefined();
      expect(turnAt(dispatches, 1).message.t3teamExt?.actor?.messageIds).toBeUndefined();
    }),
  );

  it.effect("uses the 45s default idle window when no env override is set", () =>
    Effect.gen(function* () {
      const saved = process.env[DEBOUNCE_ENV];
      delete process.env[DEBOUNCE_ENV];
      try {
        expect(T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS).toBe(45_000);
        expect(resolveActorMessageDebounceMs()).toBe(45_000);

        const dispatches: TurnStart[] = [];
        const engine = makeEngine(Stream.fromIterable([delivery("m1")]), dispatches);
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(makeLayer(engine));
            // Walk the whole default idle window in virtual 50ms steps: a
            // quiet single delivery must NOT wake the thread early.
            for (let i = 0; i < 898; i += 1) {
              yield* TestClock.adjust("50 millis"); // 44_900ms total
              yield* Effect.yieldNow;
            }
            expect(dispatches).toHaveLength(0);
            yield* TestClock.adjust("100 millis"); // 45_000ms — the claim
            yield* Effect.yieldNow;
            expect(dispatches).toHaveLength(1);
            yield* settle(dispatches);
          }),
        );
      } finally {
        if (saved === undefined) delete process.env[DEBOUNCE_ENV];
        else process.env[DEBOUNCE_ENV] = saved;
      }
    }),
  );

  it.effect("an urgent pending delivery claims the batch immediately (window 0)", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const release = yield* Deferred.make<void>();
      // m1 (normal) lands first; the urgent m2 is released once m1's drain is
      // mid-window — it must claim m1 + m2 NOW, not after the 50ms window.
      const eventStream = Stream.concat(
        Stream.fromIterable([delivery("m1")]),
        Stream.fromEffect(Deferred.await(release)).pipe(
          Stream.flatMap(() => Stream.fromIterable([delivery("m2", "urgent")])),
        ),
      );
      const engine = makeEngine(eventStream, dispatches);

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(makeLayer(engine));
          yield* TestClock.adjust("10 millis"); // m1's drain is mid-window
          expect(dispatches).toHaveLength(0);
          yield* Deferred.succeed(release, undefined);
          yield* TestClock.adjust("1 millis");
          yield* Effect.yieldNow;
          expect(dispatches).toHaveLength(1);
          // The urgent drain claimed the WHOLE pending batch.
          expect(dispatches[0]?.message.text).toBe(
            buildActorReactionBatchInput([entryFor("m1"), entryFor("m2", "urgent")]),
          );
          expect(dispatches[0]?.message.t3teamExt?.actor?.urgency).toBe("urgent");
          yield* settle(dispatches);
        }),
      );
    }),
  );
});
