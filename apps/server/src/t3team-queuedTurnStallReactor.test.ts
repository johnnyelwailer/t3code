/**
 * Queued-turn stall reaper: a turn start queued past the timeout notifies a
 * delegated child's parent exactly once per stall epoch (urgent, non-terminal),
 * survives restarts via the durable marker, and stays quiet once the turn
 * starts or the session goes terminal.
 */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { QUEUED_TURN_STALL_TIMEOUT_MS } from "./t3team-queuedTurnStall.ts";
import { buildQueuedTurnStallNotice } from "./t3team-queuedTurnStallNotify.ts";
import {
  actorMessages,
  CHILD,
  event,
  makeHarness,
  markers,
  PARENT,
  sessionSet,
  turnRequested,
} from "./t3team-queuedTurnStallTestHarness.ts";

const PAST_TIMEOUT = QUEUED_TURN_STALL_TIMEOUT_MS + 5_000;

describe("makeQueuedTurnStallReactor", () => {
  it.effect("pending past the timeout notifies the parent once, urgently, as a stall", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      yield* h.reactor.handleEvent(sessionSet("starting"));
      h.advance(QUEUED_TURN_STALL_TIMEOUT_MS - 60_000);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);

      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      const messages = actorMessages(h.dispatches);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.threadId).toBe(PARENT);
      expect(messages[0]!.fromThreadId).toBe(CHILD);
      expect(messages[0]!.urgency).toBe("urgent");
      expect(messages[0]!.text).toContain("[Child stalled in provider queue]");
      expect(messages[0]!.text).toContain("stalled, not failed");
      expect(messages[0]!.text).toContain(CHILD);
      expect(markers(h.dispatches)).toHaveLength(1);
      // Durable marker first, notice second (at-most-once across a crash).
      expect(h.dispatches.map((c) => c.type)).toEqual([
        "thread.activity.append",
        "thread.actor.message",
      ]);
      expect(messages[0]!.summary).toBe("[Child stalled in provider queue]");
      // Non-terminal: nothing beyond the notice + marker (no settle/stop).
      expect(h.dispatches).toHaveLength(2);

      // Another sweep (and a repeated starting / extra queued request) does not re-fire.
      yield* h.reactor.handleEvent(sessionSet("starting"));
      yield* h.reactor.handleEvent(turnRequested());
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      yield* h.reactor.sweep;
      expect(actorMessages(h.dispatches)).toHaveLength(1);
    }),
  );

  it.effect("restart rehydrates the durable marker and does not re-notify", () =>
    Effect.gen(function* () {
      const log = [turnRequested(), sessionSet("starting")];
      const first = makeHarness({ replay: log });
      yield* first.reactor.rehydrate;
      first.advance(PAST_TIMEOUT);
      yield* first.reactor.sweep;
      expect(actorMessages(first.dispatches)).toHaveLength(1);
      const marker = markers(first.dispatches)[0]!;

      const persisted = [
        ...log,
        event("thread.activity-appended", { threadId: CHILD, activity: marker.activity }),
      ];
      const second = makeHarness({ replay: persisted });
      yield* second.reactor.rehydrate;
      second.advance(PAST_TIMEOUT * 3);
      yield* second.reactor.sweep;
      expect(second.dispatches).toHaveLength(0);
    }),
  );

  it.effect("a new stall epoch after the turn ran notifies again", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      yield* h.reactor.handleEvent(sessionSet("running"));
      yield* h.reactor.handleEvent(sessionSet("idle"));
      yield* h.reactor.handleEvent(turnRequested(CHILD, h.nowIso()));
      yield* h.reactor.sweep;
      // The new request starts a fresh clock: not due until the timeout passes again.
      expect(actorMessages(h.dispatches)).toHaveLength(1);
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(actorMessages(h.dispatches)).toHaveLength(2);
    }),
  );

  it.effect("session going running before the timeout never notifies", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      h.advance(60_000);
      yield* h.reactor.handleEvent(sessionSet("running"));
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);
    }),
  );

  it.effect("a request queued behind a running turn is not a stall", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(sessionSet("running"));
      yield* h.reactor.handleEvent(turnRequested());
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);
    }),
  );

  for (const status of ["error", "stopped", "interrupted"]) {
    it.effect(`pending cleared by a terminal ${status} session never notifies`, () =>
      Effect.gen(function* () {
        const h = makeHarness();
        yield* h.reactor.handleEvent(turnRequested());
        yield* h.reactor.handleEvent(sessionSet(status));
        h.advance(PAST_TIMEOUT);
        yield* h.reactor.sweep;
        expect(h.dispatches).toHaveLength(0);
      }),
    );
  }

  it.effect("the projection no longer holding the pending turn drops the entry", () =>
    Effect.gen(function* () {
      const h = makeHarness();
      yield* h.reactor.handleEvent(turnRequested());
      h.pendingTurns.delete(CHILD);
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      h.pendingTurns.add(CHILD);
      yield* h.reactor.sweep;
      expect(h.dispatches).toHaveLength(0);
    }),
  );

  it.effect("a thread without a parent gets only the durable marker", () =>
    Effect.gen(function* () {
      const h = makeHarness({ parent: null });
      yield* h.reactor.handleEvent(turnRequested());
      h.advance(PAST_TIMEOUT);
      yield* h.reactor.sweep;
      expect(actorMessages(h.dispatches)).toHaveLength(0);
      const marker = markers(h.dispatches);
      expect(marker).toHaveLength(1);
      expect(marker[0]!.threadId).toBe(CHILD);
      expect(
        (marker[0]!.activity.payload as { parentThreadId: unknown }).parentThreadId,
      ).toBeNull();
    }),
  );

  it("notice text rounds the stall to minutes", () => {
    expect(
      buildQueuedTurnStallNotice({ childTitle: "T", childThreadId: "c", stalledMs: 12 * 60_000 }),
    ).toContain("about 12 min");
  });
});
