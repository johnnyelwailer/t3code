/**
 * Durable child-wait — the `wait` op of `t3team.thread.children` (GHE #55).
 *
 * A wait is NOT a poll loop. When the parent calls `children({op:"wait"})`, the
 * tool handler registers a durable `t3team.child_wait.registered` activity on
 * the PARENT thread (a persisted orchestration event). This module family owns
 * the resolution:
 *
 *   - an in-memory index of pending waits (t3team-childWaitIndex.ts), rebuilt
 *     on boot by REPLAYING the persisted events (registered minus resolved) —
 *     the same rehydrate pattern as the actor mailbox;
 *   - a host timer for deadlines (t3team-childWaitScheduler.ts), the
 *     orchestration engine's durable-timer idiom;
 *   - an event reactor (t3team-childWaitReactor.ts) that resolves a wait when
 *     the waited-on child's session leaves "running" into a terminal status
 *     matching the wait's `on`.
 *
 * This module holds the shared types, the pure outcome-matching helpers, and
 * the persisted-event replay used for rehydration; the live layer is
 * `T3TeamChildWaitReactorLive` (re-exported here).
 *
 * @module t3team-childWait
 */
import { type OrchestrationEvent } from "@t3tools/contracts";

export { makeChildWaitIndex, type ChildWaitIndex } from "./t3team-childWaitIndex.ts";
export {
  makeChildWaitScheduler,
  type ChildWaitClock,
  type ChildWaitScheduler,
  type ChildWaitSchedulerDeps,
} from "./t3team-childWaitScheduler.ts";
export { T3TeamChildWaitReactorLive } from "./t3team-childWaitReactor.ts";

export const CHILD_WAIT_REGISTERED_KIND = "t3team.child_wait.registered";
export const CHILD_WAIT_RESOLVED_KIND = "t3team.child_wait.resolved";

export type ChildWaitOn = "terminal" | "completed" | "failed";

/** A terminal outcome the waited-on child reached. */
export type ChildWaitOutcome = "completed" | "failed" | "aborted" | "timeout";

export interface ChildWaitRecord {
  readonly waitId: string;
  readonly parentThreadId: string;
  readonly childThreadId: string;
  readonly childTitle: string;
  readonly on: ChildWaitOn;
  readonly deadlineIso?: string;
}

// ── Outcome matching (pure) ─────────────────────────────────────────────────

/** Map a session status onto a wait outcome. `null` = not a terminal status. */
export function sessionStatusToWaitOutcome(
  status: string,
): "completed" | "failed" | "aborted" | null {
  switch (status) {
    case "idle":
    case "ready":
      return "completed";
    case "error":
      return "failed";
    case "interrupted":
    case "stopped":
      return "aborted";
    default:
      return null;
  }
}

/** Does a reached outcome satisfy the wait's `on` filter? */
export function childWaitOutcomeMatches(outcome: ChildWaitOutcome, on: ChildWaitOn): boolean {
  if (on === "terminal") {
    return outcome === "completed" || outcome === "failed" || outcome === "aborted";
  }
  if (on === "completed") return outcome === "completed";
  if (on === "failed") return outcome === "failed";
  return false;
}

// ── Rehydration: replay persisted events into the pending index ────────────

export function collectPendingChildWaits(
  events: ReadonlyArray<OrchestrationEvent>,
): ReadonlyArray<ChildWaitRecord> {
  const pending = new Map<string, ChildWaitRecord>();
  for (const event of events) {
    if (event.type !== "thread.activity-appended") continue;
    const activity = event.payload.activity;
    if (activity.kind === CHILD_WAIT_REGISTERED_KIND) {
      const payload = activity.payload as
        | {
            readonly waitId?: unknown;
            readonly childThreadId?: unknown;
            readonly childTitle?: unknown;
            readonly on?: unknown;
            readonly deadlineIso?: unknown;
          }
        | null
        | undefined;
      if (
        !payload ||
        typeof payload.waitId !== "string" ||
        typeof payload.childThreadId !== "string"
      ) {
        continue;
      }
      const on: ChildWaitOn =
        payload.on === "completed" || payload.on === "failed" ? payload.on : "terminal";
      pending.set(payload.waitId, {
        waitId: payload.waitId,
        parentThreadId: event.payload.threadId,
        childThreadId: payload.childThreadId,
        childTitle: typeof payload.childTitle === "string" ? payload.childTitle : "child",
        on,
        ...(typeof payload.deadlineIso === "string" ? { deadlineIso: payload.deadlineIso } : {}),
      });
    } else if (activity.kind === CHILD_WAIT_RESOLVED_KIND) {
      const payload = activity.payload as { readonly waitId?: unknown } | null | undefined;
      if (payload && typeof payload.waitId === "string") {
        pending.delete(payload.waitId);
      }
    }
  }
  return Array.from(pending.values());
}
