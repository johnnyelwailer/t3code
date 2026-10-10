/**
 * Queued-turn stall reaper, review follow-ups: which events clear a pending
 * entry (mirroring the projection), which stalls get the marker without a
 * parent notice (archived / older than the notify-age cap), and the boot
 * replay/live-stream merge.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  QUEUED_TURN_STALL_MAX_NOTIFY_AGE_MS,
  QUEUED_TURN_STALL_TIMEOUT_MS,
} from "./t3team-queuedTurnStall.ts";
import {
  actorMessages,
  CHILD,
  event,
  makeHarness,
  markers,
  sessionSet,
  turnRequested,
} from "./t3team-queuedTurnStallTestHarness.ts";

const PAST_TIMEOUT = QUEUED_TURN_STALL_TIMEOUT_MS + 5_000;

describe("queued-turn stall: pending clears mirror the projection", () => {
  it.effect("running/waiting reported with a null activeTurnId keeps the entry pending", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      // The provider reports the still-queued run as running (runtime
      // `waiting`/`running` before a turn exists): no activeTurnId yet.
      yield* h.reactor.handleEvent(sessionSet("running", CHILD, null));
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(actorMessages(h.dispatches)).toHaveLength(1);
    }),
  );

  it.effect("running with a real activeTurnId clears the entry", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      yield* h.reactor.handleEvent(sessionSet("running", CHILD, "turn-7"));
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);
    }),
  );

  it.effect("provider.turn.start.failed clears the entry", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      yield* h.reactor.handleEvent(
        event("thread.activity-appended", {
          threadId: CHILD,
          activity: { kind: "provider.turn.start.failed", payload: {} },
        }),
      );
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);
    }),
  );

  it.effect("thread.settled clears the entry", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      yield* h.reactor.handleEvent(event("thread.settled", { threadId: CHILD }));
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);
    }),
  );
});

describe("queued-turn stall: marker without a parent notice", () => {
  it.effect("an archived child gets the durable marker only", () =>
    Effect.gen(function* () {
      const h = makeHarness({ archivedAt: "2023-11-01T00:00:00.000Z" });
      yield* h.reactor.handleEvent(turnRequested());
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(actorMessages(h.dispatches)).toHaveLength(0);
      const marker = markers(h.dispatches);
      expect(marker).toHaveLength(1);
      expect(marker[0]!.activity.payload).toMatchObject({
        parentThreadId: null,
        suppressed: "archived",
      });
    }),
  );

  it.effect("a stall older than the notify-age cap (first boot) gets the marker only", () =>
    Effect.gen(function* () {
      const h = makeHarness({ replay: [turnRequested(), sessionSet("starting")] });
      yield* h.reactor.rehydrate;
      h.advance(QUEUED_TURN_STALL_MAX_NOTIFY_AGE_MS + 60_000);
      yield* h.reactor.sweep;
      expect(actorMessages(h.dispatches)).toHaveLength(0);
      expect(markers(h.dispatches)[0]!.activity.payload).toMatchObject({ suppressed: "stale" });
      // Recorded as reported: no later notice for the same epoch.
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(1);
    }),
  );
});

describe("queued-turn stall: boot replay vs live stream", () => {
  it.effect("a live clear that lands during replay is not undone by the older request", () =>
    Effect.gen(function* () {
      const request = turnRequested();
      const started = sessionSet("running", CHILD, "turn-1");
      // The replay snapshot ends at the request; the clear arrives live,
      // together with a duplicate of the already-replayed request.
      const h = makeHarness({ replay: [request], live: [started, request] });
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* h.reactor.startEventStream();
          yield* Effect.yieldNow;
          yield* h.reactor.rehydrate;
        }),
      );
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);
    }),
  );
});
