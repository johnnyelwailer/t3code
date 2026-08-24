/**
 * Inter-agent restart hold (GHE #155): a restart with N pending inter-agent
 * messages + K interrupted children must produce ZERO auto reaction turns,
 * and the user's "continue" must surface exactly ONE summary turn.
 *
 * `it.effect` installs the test clock, so the 50ms debounce window (pinned
 * via env) is driven with `TestClock.adjust` — no real waiting, and the
 * settle checks prove no extra turn follows the expected one.
 */
import type {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationThread,
  OrchestrationThreadShell,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it } from "@effect/vitest";
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
  buildActorRestartHoldSummary,
  collectStaleSessionThreadIdsAtRehydrate,
  type InterruptedChildThread,
} from "./t3team-actorRestartHold.ts";

const DEBOUNCE_ENV = "T3TEAM_ACTOR_MESSAGE_DEBOUNCE_MS";
const ORIGINAL_DEBOUNCE = process.env[DEBOUNCE_ENV];
process.env[DEBOUNCE_ENV] = "50";

afterEach(() => {
  if (ORIGINAL_DEBOUNCE === undefined) delete process.env[DEBOUNCE_ENV];
  else process.env[DEBOUNCE_ENV] = ORIGINAL_DEBOUNCE;
});

const entryFor = (messageId: string): T3TeamActorMailboxEntry => ({
  messageId,
  fromThreadId: `sender-${messageId}`,
  fromTitle: `Sender ${messageId}`,
  fromProjectId: "project",
  text: `body ${messageId}`,
  urgency: "normal",
  hopCount: 1,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
});

const delivery = (messageId: string): OrchestrationEvent =>
  ({
    type: "thread.actor-message-delivered",
    payload: { threadId: "target", ...entryFor(messageId) },
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

const replayedSessionSet = (sequence: number, status: string): OrchestrationEvent =>
  ({
    sequence,
    type: "thread.session-set",
    payload: {
      threadId: "target",
      session: { status },
      createdAt: "2026-07-19T08:00:00.000Z",
    },
  }) as unknown as OrchestrationEvent;

const replayedDelivery = (sequence: number, messageId: string): OrchestrationEvent =>
  ({
    sequence,
    type: "thread.actor-message-delivered",
    payload: { threadId: "target", ...entryFor(messageId) },
  }) as unknown as OrchestrationEvent;

const idleThread = {
  id: ThreadId.make("target"),
  session: { status: "idle" },
  latestTurn: null,
  modelSelection: null,
  runtimeMode: null,
  interactionMode: null,
} as unknown as OrchestrationThread;

const stoppedChildShell = {
  id: ThreadId.make("child-1"),
  title: "Child One",
  session: { status: "stopped" },
  childStatus: "Running: writing the parser",
} as unknown as OrchestrationThreadShell;

type TurnStart = Extract<OrchestrationCommand, { type: "thread.turn.start" }>;

/**
 * A fake SqlClient whose `sql` tagged template answers the descendant walk:
 * `target` has one child (`child-1`), which has none (the BFS terminates).
 */
const descendantSql = (
  _strings: TemplateStringsArray,
  ...values: unknown[]
): Effect.Effect<ReadonlyArray<{ childThreadId: string | null }>> =>
  Effect.succeed(values[0] === "target" ? [{ childThreadId: "child-1" }] : []);

/** A fake SqlClient with no descendants at all. */
const noDescendantsSql = (
  _strings: TemplateStringsArray,
  ..._values: unknown[]
): Effect.Effect<ReadonlyArray<{ childThreadId: string | null }>> => Effect.succeed([]);

const makeEngine = (
  replayed: ReadonlyArray<OrchestrationEvent>,
  eventStream: Stream.Stream<OrchestrationEvent>,
  dispatches: TurnStart[],
): OrchestrationEngineShape =>
  ({
    streamDomainEvents: eventStream,
    readEvents: () => Stream.fromIterable(replayed),
    dispatch: (command: OrchestrationCommand) =>
      Effect.sync(() => {
        dispatches.push(command as TurnStart);
      }),
  }) as unknown as OrchestrationEngineShape;

const makeLayer = (engine: OrchestrationEngineShape, sql: unknown) =>
  T3TeamActorMessageReactorLive.pipe(
    Layer.provideMerge(Layer.succeed(OrchestrationEngineService, engine)),
    Layer.provideMerge(
      Layer.succeed(ProjectionSnapshotQuery, {
        getThreadDetailById: () => Effect.succeed(Option.some(idleThread)),
        getThreadShellById: (id: ThreadId) =>
          Effect.succeed(id === "child-1" ? Option.some(stoppedChildShell) : Option.none()),
      } as unknown as ProjectionSnapshotQueryShape),
    ),
    Layer.provideMerge(Layer.succeed(SqlClient.SqlClient, sql as never)),
  );

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

describe("collectStaleSessionThreadIdsAtRehydrate", () => {
  it("includes threads whose last session-set is running or starting", () => {
    const events: OrchestrationEvent[] = [
      replayedSessionSet(1, "running"),
      replayedSessionSet(2, "starting"),
    ];
    // Both events are for "target"; the LAST one wins.
    expect(collectStaleSessionThreadIdsAtRehydrate(events)).toEqual(new Set(["target"]));
  });

  it("excludes threads whose session settled before the crash", () => {
    const events: OrchestrationEvent[] = [
      replayedSessionSet(1, "running"),
      replayedSessionSet(2, "idle"),
    ];
    expect(collectStaleSessionThreadIdsAtRehydrate(events)).toEqual(new Set());
  });

  it("ignores non-live terminal statuses", () => {
    const events: OrchestrationEvent[] = [
      replayedSessionSet(1, "stopped"),
      replayedSessionSet(2, "error"),
    ];
    expect(collectStaleSessionThreadIdsAtRehydrate(events)).toEqual(new Set());
  });
});

describe("buildActorRestartHoldSummary", () => {
  it("lists interrupted children with title + last state, and one line per held message", () => {
    const interrupted: InterruptedChildThread[] = [
      { threadId: "child-1", title: "Child One", lastState: "Running: writing the parser" },
    ];
    const text = buildActorRestartHoldSummary({
      entries: [entryFor("m1"), entryFor("m2")],
      interruptedChildren: interrupted,
    });
    expect(text).toContain("1 child thread(s) were interrupted");
    expect(text).toContain(
      "- «Child One» (thread child-1) — last state: Running: writing the parser",
    );
    expect(text).toContain("2 inter-agent message(s) were pending");
    expect(text).toContain("- [m1] from «Sender m1» (thread sender-m1): body m1");
    expect(text).toContain("- [m2] from «Sender m2» (thread sender-m2): body m2");
    expect(text).toContain("t3team_read_message");
  });

  it("summarizes over-long held bodies with the pull marker instead of the raw body", () => {
    const longBody = "x".repeat(4000);
    const entry: T3TeamActorMailboxEntry = { ...entryFor("m1"), text: longBody };
    const text = buildActorRestartHoldSummary({ entries: [entry], interruptedChildren: [] });
    expect(text).not.toContain(longBody);
    expect(text).toContain("…[summarized — 4000 chars total; message id m1");
  });

  it("omits empty sections instead of emitting an empty summary", () => {
    const text = buildActorRestartHoldSummary({
      entries: [entryFor("m1")],
      interruptedChildren: [],
    });
    expect(text).not.toContain("child thread(s) were interrupted");
    expect(text).toContain("1 inter-agent message(s) were pending");
  });
});

describe("T3TeamActorMessageReactorLive (restart hold)", () => {
  it.effect(
    "restart with N pending messages + K interrupted children → 0 auto turns; continue → ONE summary turn (GHE #155)",
    () =>
      Effect.gen(function* () {
        const dispatches: TurnStart[] = [];
        // The replayed log: the orchestrator was RUNNING when the process
        // died, with two pending inter-agent deliveries.
        const replayed: OrchestrationEvent[] = [
          replayedSessionSet(1, "running"),
          replayedDelivery(2, "m1"),
          replayedDelivery(3, "m2"),
        ];
        // Live events after rehydrate: the startup reconcile stops the stale
        // session, the #157 abnormal-stop notification for the interrupted
        // child arrives — THEN (after the storm window is asserted clean) the
        // user's continue (resume) turn starts and settles cleanly, and a
        // SECOND later turn settles (the hold must already be consumed).
        const release = yield* Deferred.make<void>();
        const releaseSecond = yield* Deferred.make<void>();
        const eventStream = Stream.concat(
          Stream.concat(
            Stream.fromIterable([sessionSet("stopped"), delivery("m3")]),
            Stream.fromEffect(Deferred.await(release)).pipe(
              Stream.flatMap(() =>
                Stream.fromIterable([sessionSet("starting"), sessionSet("idle")]),
              ),
            ),
          ),
          Stream.fromEffect(Deferred.await(releaseSecond)).pipe(
            Stream.flatMap(() => Stream.fromIterable([sessionSet("starting"), sessionSet("idle")])),
          ),
        );
        const engine = makeEngine(replayed, eventStream, dispatches);

        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(makeLayer(engine, descendantSql as never));
            // The restart storm (reconcile + live #157 notification) must
            // produce ZERO auto reaction turns…
            yield* settle(dispatches);
            expect(dispatches).toHaveLength(0);
            // …then the user continues: exactly ONE summary turn — the
            // interrupted child plus all three held messages (the two
            // rehydrated + the live #157 one), not N+K turns.
            yield* Deferred.succeed(release, undefined);
            yield* waitForDispatches(dispatches, 1);
            const turn = dispatches[0];
            if (turn === undefined) throw new Error("expected the summary turn");
            expect(turn.type).toBe("thread.turn.start");
            expect(turn.threadId).toBe("target");
            expect(turn.message.text).toBe(
              buildActorRestartHoldSummary({
                entries: [entryFor("m1"), entryFor("m2"), entryFor("m3")],
                interruptedChildren: [
                  {
                    threadId: "child-1",
                    title: "Child One",
                    lastState: "Running: writing the parser",
                  },
                ],
              }),
            );
            expect(turn.message.t3teamExt?.visibleToUser).toBe(false);
            expect(turn.message.t3teamExt?.actor?.messageIds).toEqual(["m1", "m2", "m3"]);
            // …and nothing follows it. A SECOND clean settle must NOT surface
            // another summary — the hold was consumed by the first continue.
            yield* settle(dispatches);
            yield* Deferred.succeed(releaseSecond, undefined);
            yield* settle(dispatches);
            expect(dispatches).toHaveLength(1);
          }),
        );
      }),
  );

  it.effect("a held thread with no held work gets NO summary turn (no empty summary)", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      // Suppressed by a user stop, no pending deliveries, no descendants.
      const replayed: OrchestrationEvent[] = [
        {
          sequence: 1,
          type: "thread.turn-interrupt-requested",
          payload: { threadId: "target", byUser: true, createdAt: "2026-07-19T08:00:00.000Z" },
        } as unknown as OrchestrationEvent,
      ];
      const eventStream = Stream.fromIterable([
        sessionSet("starting"), // the user continues anyway
        sessionSet("idle"), // …and the turn settles
      ]);
      const engine = makeEngine(replayed, eventStream, dispatches);

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(makeLayer(engine, noDescendantsSql as never));
          yield* settle(dispatches);
          expect(dispatches).toHaveLength(0);
        }),
      );
    }),
  );

  it.effect("a user STOP settle never re-opens a held thread (no summary on interrupted)", () =>
    Effect.gen(function* () {
      const dispatches: TurnStart[] = [];
      const replayed: OrchestrationEvent[] = [
        replayedSessionSet(1, "running"),
        replayedDelivery(2, "m1"),
      ];
      // The user stops the (restarted) thread: the stop settle is
      // `interrupted`, not a clean settle — the hold must survive.
      const eventStream = Stream.fromIterable([
        sessionSet("stopped"), // startup reconcile
        sessionSet("interrupted"), // user stop settle
      ]);
      const engine = makeEngine(replayed, eventStream, dispatches);

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(makeLayer(engine, descendantSql as never));
          yield* settle(dispatches);
          expect(dispatches).toHaveLength(0);
        }),
      );
    }),
  );
});
