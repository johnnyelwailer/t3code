/**
 * Queued-turn stall reaper: a turn start queued past the timeout notifies a
 * delegated child's parent exactly once per stall epoch (urgent, non-terminal),
 * survives restarts via the durable marker, and stays quiet once the turn
 * starts or the session goes terminal.
 */
import type { OrchestrationCommand, OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import {
  QUEUED_TURN_STALL_NOTIFIED_KIND,
  QUEUED_TURN_STALL_TIMEOUT_MS,
} from "./t3team-queuedTurnStall.ts";
import { buildQueuedTurnStallNotice } from "./t3team-queuedTurnStallNotify.ts";
import { makeQueuedTurnStallReactor } from "./t3team-queuedTurnStallReactor.ts";

const CHILD = "child-1";
const PARENT = "parent-1";
const START = 1_700_000_000_000;
const START_ISO = "2023-11-14T22:13:20.000Z"; // START as ISO

let seq = 0;
const event = (type: string, payload: unknown, extra: Record<string, unknown> = {}) =>
  ({
    sequence: ++seq,
    type,
    payload,
    occurredAt: START_ISO,
    commandId: null,
    ...extra,
  }) as unknown as OrchestrationEvent;

const turnRequested = (threadId = CHILD) =>
  event("thread.turn-start-requested", { threadId, messageId: `m-${seq}`, createdAt: START_ISO });
const sessionSet = (status: string, threadId = CHILD) =>
  event("thread.session-set", { threadId, session: { threadId, status, activeTurnId: null } });

function makeHarness(input: { parent?: string | null; replay?: OrchestrationEvent[] } = {}) {
  const dispatches: OrchestrationCommand[] = [];
  const pendingTurns = new Set<string>([CHILD]);
  let nowMs = START;
  const parent = input.parent === undefined ? PARENT : input.parent;
  const reactor = makeQueuedTurnStallReactor({
    engine: {
      dispatch: (command: OrchestrationCommand) =>
        Effect.sync(() => {
          dispatches.push(command);
          return { sequence: 0 };
        }),
      readEvents: () => Stream.fromIterable(input.replay ?? []),
      streamDomainEvents: Stream.empty,
    } as never,
    query: {
      getThreadDetailById: () =>
        Effect.succeed(
          Option.some({
            id: CHILD,
            title: "QA child",
            projectId: "project-1",
            activities:
              parent === null
                ? []
                : [{ kind: "t3team.handoff.created", payload: { parentThreadId: parent } }],
          }),
        ),
      hasPendingTurnStart: (threadId: string) => Effect.succeed(pendingTurns.has(threadId)),
    } as never,
    clock: { now: () => nowMs, setTimer: () => undefined, clearTimer: () => undefined },
  });
  return {
    reactor,
    dispatches,
    pendingTurns,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

const actorMessages = (dispatches: OrchestrationCommand[]) =>
  dispatches.filter((c) => c.type === "thread.actor.message") as Array<
    Extract<OrchestrationCommand, { type: "thread.actor.message" }>
  >;
const markers = (dispatches: OrchestrationCommand[]) =>
  dispatches.filter(
    (c) =>
      c.type === "thread.activity.append" && c.activity.kind === QUEUED_TURN_STALL_NOTIFIED_KIND,
  ) as Array<Extract<OrchestrationCommand, { type: "thread.activity.append" }>>;

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
      yield* h.reactor.handleEvent(turnRequested());
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
