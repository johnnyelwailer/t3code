/**
 * Shared test harness for the queued-turn stall reaper tests: a fake engine
 * (recorded dispatches, replay log, live stream), a fake projection query and
 * a manual clock. Test-only; not wired into the server.
 *
 * @module t3team-queuedTurnStallTestHarness
 */
import type { OrchestrationCommand, OrchestrationEvent } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { QUEUED_TURN_STALL_NOTIFIED_KIND } from "./t3team-queuedTurnStall.ts";
import { makeQueuedTurnStallReactor } from "./t3team-queuedTurnStallReactor.ts";

export const CHILD = "child-1";
export const PARENT = "parent-1";
export const START = 1_700_000_000_000;
export const START_ISO = "2023-11-14T22:13:20.000Z"; // START as ISO

let seq = 0;
export const event = (type: string, payload: unknown, extra: Record<string, unknown> = {}) =>
  ({
    sequence: ++seq,
    type,
    payload,
    occurredAt: START_ISO,
    commandId: null,
    ...extra,
  }) as unknown as OrchestrationEvent;

export const turnRequested = (threadId = CHILD, createdAt = START_ISO) =>
  event("thread.turn-start-requested", { threadId, messageId: `m-${seq}`, createdAt });
export const sessionSet = (
  status: string,
  threadId = CHILD,
  activeTurnId: string | null = status === "running" ? "turn-1" : null,
) => event("thread.session-set", { threadId, session: { threadId, status, activeTurnId } });

export function makeHarness(
  input: {
    parent?: string | null;
    replay?: OrchestrationEvent[];
    live?: OrchestrationEvent[];
    archivedAt?: string | null;
  } = {},
) {
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
      streamDomainEvents: Stream.fromIterable(input.live ?? []),
    } as never,
    query: {
      getThreadDetailById: () =>
        Effect.succeed(
          Option.some({
            id: CHILD,
            title: "QA child",
            projectId: "project-1",
            archivedAt: input.archivedAt ?? null,
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
    nowIso: () => DateTime.formatIso(DateTime.makeUnsafe(nowMs)),
  };
}

export const actorMessages = (dispatches: OrchestrationCommand[]) =>
  dispatches.filter((c) => c.type === "thread.actor.message") as Array<
    Extract<OrchestrationCommand, { type: "thread.actor.message" }>
  >;
export const markers = (dispatches: OrchestrationCommand[]) =>
  dispatches.filter(
    (c) =>
      c.type === "thread.activity.append" && c.activity.kind === QUEUED_TURN_STALL_NOTIFIED_KIND,
  ) as Array<Extract<OrchestrationCommand, { type: "thread.activity.append" }>>;
