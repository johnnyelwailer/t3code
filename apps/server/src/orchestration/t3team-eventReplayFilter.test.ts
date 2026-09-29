import type { OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  collectSuppressedThreadsAtRehydrate,
  SUPPRESSION_REPLAY_FILTERS,
} from "../t3team-actorMessageSuppression.ts";
import {
  collectPendingActorDeliveries,
  PENDING_ACTOR_DELIVERY_REPLAY_FILTERS,
} from "../t3team-actorReactionInput.ts";
import {
  collectStaleSessionThreadIdsAtRehydrate,
  STALE_SESSION_REPLAY_FILTERS,
} from "../t3team-actorRestartHold.ts";
import {
  CHILD_CLEANUP_NUDGED_KIND,
  CLEANUP_NUDGE_REPLAY_FILTERS,
  collectLastCleanupNudges,
} from "../t3team-childCleanupNudge.ts";
import {
  collectPendingChildWaits,
  PENDING_CHILD_WAIT_REPLAY_FILTERS,
} from "../t3team-childWait.ts";
import {
  THREAD_SILENCE_WATCH_CANCELLED_KIND,
  THREAD_SILENCE_WATCH_REGISTERED_KIND,
} from "../t3team-threadSilenceWatch.ts";
import {
  collectPendingThreadSilenceWatches,
  LAST_TERMINAL_REPLAY_FILTERS,
  lastTerminalSequenceByThread,
  PENDING_SILENCE_WATCH_REPLAY_FILTERS,
} from "../t3team-threadSilenceWatchRehydrate.ts";
import { matchesEventReplayFilters } from "./t3team-eventReplayFilter.ts";

const at = "2026-09-29T10:00:00.000Z";
const event = (sequence: number, type: string, payload: object) =>
  ({ sequence, type, payload: { createdAt: at, ...payload } }) as unknown as OrchestrationEvent;
const activity = (sequence: number, threadId: string, kind: string, payload: object) =>
  event(sequence, "thread.activity-appended", {
    threadId,
    activity: { id: `a-${sequence}`, kind, payload, turnId: null, createdAt: at },
  });

// A log interleaving every event class the four startup rehydrates read with the
// high-volume history they must not need (assistant messages, meta updates, tool activity).
const log: ReadonlyArray<OrchestrationEvent> = [
  event(1, "thread.session-set", { threadId: "child", session: { status: "running" } }),
  event(2, "thread.message-sent", { threadId: "parent", role: "assistant", text: "noise" }),
  event(3, "thread.meta-updated", { threadId: "parent", title: "noise" }),
  activity(4, "parent", "tool.updated", { waitId: "w1" }),
  activity(5, "parent", "t3team.child_wait.registered", { waitId: "w1", childThreadId: "child" }),
  activity(6, "parent", "t3team.child_wait.registered", { waitId: "w2", childThreadId: "c2" }),
  activity(7, "parent", "t3team.child_wait.resolved", { waitId: "w2", childThreadId: "c2" }),
  activity(8, "parent", CHILD_CLEANUP_NUDGED_KIND, { at, count: 3 }),
  event(9, "thread.actor-message-delivered", {
    threadId: "parent",
    messageId: "m1",
    fromThreadId: "child",
    fromTitle: "Child",
    fromProjectId: "p",
    text: "done",
    urgency: "normal",
    hopCount: 1,
    rootThreadId: "parent",
  }),
  event(10, "thread.turn-interrupt-requested", { threadId: "parent", byUser: true }),
  activity(11, "parent", THREAD_SILENCE_WATCH_REGISTERED_KIND, {
    watchId: "s1",
    targetThreadId: "child",
    timeoutMs: 60_000,
  }),
  activity(12, "parent", THREAD_SILENCE_WATCH_REGISTERED_KIND, {
    watchId: "s2",
    targetThreadId: "c2",
    timeoutMs: 60_000,
  }),
  activity(13, "parent", THREAD_SILENCE_WATCH_CANCELLED_KIND, { targetThreadId: "c2" }),
  event(14, "thread.session-set", { threadId: "c2", session: { status: "stopped" } }),
  activity(15, "parent", THREAD_SILENCE_WATCH_REGISTERED_KIND, {
    watchId: "s3",
    targetThreadId: "c3",
    timeoutMs: 60_000,
  }),
  event(15, "thread.deleted", { threadId: "gone", deletedAt: at }),
  event(16, "thread.settled", { threadId: "c3" }),
  event(17, "thread.message-sent", { threadId: "other", role: "user", text: "hi" }),
  event(18, "thread.turn-interrupt-requested", { threadId: "other", byUser: true }),
];

const only = (filters: Parameters<typeof matchesEventReplayFilters>[1]) =>
  log.filter((candidate) => matchesEventReplayFilters(candidate, filters));

describe("startup rehydrate replay filters", () => {
  // Each collector must fold its filtered slice to the same state as the whole log:
  // a filter that misses an event type the fold reads would silently drop state.
  it.each([
    ["suppression", SUPPRESSION_REPLAY_FILTERS, collectSuppressedThreadsAtRehydrate],
    [
      "pending actor deliveries",
      PENDING_ACTOR_DELIVERY_REPLAY_FILTERS,
      (events: ReadonlyArray<OrchestrationEvent>) => collectPendingActorDeliveries(events, 5),
    ],
    ["stale sessions", STALE_SESSION_REPLAY_FILTERS, collectStaleSessionThreadIdsAtRehydrate],
    ["cleanup nudges", CLEANUP_NUDGE_REPLAY_FILTERS, collectLastCleanupNudges],
    ["pending child waits", PENDING_CHILD_WAIT_REPLAY_FILTERS, collectPendingChildWaits],
    [
      "pending silence watches",
      PENDING_SILENCE_WATCH_REPLAY_FILTERS,
      collectPendingThreadSilenceWatches,
    ],
    ["last terminal sequence", LAST_TERMINAL_REPLAY_FILTERS, lastTerminalSequenceByThread],
  ] as const)("%s folds the filtered slice like the whole log", (_name, filters, collect) => {
    const fold = collect as (events: ReadonlyArray<OrchestrationEvent>) => unknown;
    const full = fold(log);
    expect(fold(only(filters))).toEqual(full);
    // The fixture must exercise the fold, or the equality proves nothing.
    expect(full).not.toEqual(fold([]));
  });

  it("drops the history no rehydrate reads", () => {
    const all = [
      ...SUPPRESSION_REPLAY_FILTERS,
      ...PENDING_ACTOR_DELIVERY_REPLAY_FILTERS,
      ...STALE_SESSION_REPLAY_FILTERS,
      ...CLEANUP_NUDGE_REPLAY_FILTERS,
      ...PENDING_CHILD_WAIT_REPLAY_FILTERS,
      ...PENDING_SILENCE_WATCH_REPLAY_FILTERS,
      ...LAST_TERMINAL_REPLAY_FILTERS,
    ];
    expect(only(all).map((candidate) => candidate.sequence)).toEqual(
      log
        .map((candidate) => candidate.sequence)
        .filter((sequence) => ![2, 3, 4].includes(sequence)),
    );
  });
});
