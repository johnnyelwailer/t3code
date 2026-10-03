/**
 * In-memory activity of WATCHED threads for the silence watch: the last agent
 * activity stamp and the set of in-progress tool items (set-based per item id,
 * so a lost or repeated update can never drift a counter). Only threads with an
 * open watch are tracked; the reactor seeds a thread from its projection when a
 * watch is opened or re-read after a restart, and live V2 domain events keep it
 * current from then on.
 *
 * @module t3team-threadSilenceWatchActivity
 */
import {
  isOrchestrationV2WorkActive,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/** Turn items that are tool work (a long one in progress makes silence legitimate). */
export const SILENCE_TOOL_ITEM_TYPES: ReadonlyArray<OrchestrationV2TurnItem["type"]> = [
  "command_execution",
  "file_change",
  "file_search",
  "web_search",
  "dynamic_tool",
  "subagent",
];
const TOOL_TYPES: ReadonlySet<string> = new Set(SILENCE_TOOL_ITEM_TYPES);

/** Domain events that mean the target's agent did something (user actions do not count). */
const ACTIVITY_EVENT_TYPES: ReadonlySet<OrchestrationV2DomainEvent["type"]> = new Set([
  "run.created",
  "run.updated",
  "run-attempt.updated",
  "node.updated",
  "subagent.updated",
  "provider-turn.updated",
  "runtime-request.updated",
  "message.updated",
  "turn-item.updated",
  "plan.updated",
]);

const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

export interface SilenceActivityState {
  readonly lastActivityAtMs: number;
  readonly pendingToolCount: number;
}

interface TrackedThread {
  lastActivityAtMs: number;
  readonly activeToolItemIds: Set<string>;
}

export const makeSilenceActivityTracker = () => {
  const byThread = new Map<string, TrackedThread>();

  return {
    isTracked: (threadId: string) => byThread.has(threadId),
    /** Starts tracking from a persisted snapshot; live state, once present, always wins. */
    seed: (threadId: string, lastActivityAtMs: number, activeToolItemIds: Iterable<string>) => {
      if (byThread.has(threadId)) return;
      byThread.set(threadId, { lastActivityAtMs, activeToolItemIds: new Set(activeToolItemIds) });
    },
    note: (event: OrchestrationV2DomainEvent) => {
      const tracked = byThread.get(event.threadId);
      if (tracked === undefined || !ACTIVITY_EVENT_TYPES.has(event.type)) return;
      const atMs = DateTime.toEpochMillis(event.occurredAt);
      tracked.lastActivityAtMs = Math.max(tracked.lastActivityAtMs, atMs);
      if (event.type === "turn-item.updated" && TOOL_TYPES.has(event.payload.type)) {
        if (isOrchestrationV2WorkActive(event.payload.status)) {
          tracked.activeToolItemIds.add(event.payload.id);
        } else {
          tracked.activeToolItemIds.delete(event.payload.id);
        }
      }
      // No tool of a finished run is still running, whatever its last update said.
      if (event.type === "run.updated" && TERMINAL_RUN_STATUSES.has(event.payload.status)) {
        tracked.activeToolItemIds.clear();
      }
    },
    get: (threadId: string): SilenceActivityState | undefined => {
      const tracked = byThread.get(threadId);
      return tracked === undefined
        ? undefined
        : {
            lastActivityAtMs: tracked.lastActivityAtMs,
            pendingToolCount: tracked.activeToolItemIds.size,
          };
    },
    forget: (threadId: string) => {
      byThread.delete(threadId);
    },
    /** Drops every tracked thread that no longer has an open watch. */
    retain: (threadIds: ReadonlySet<string>) => {
      for (const threadId of byThread.keys()) {
        if (!threadIds.has(threadId)) byThread.delete(threadId);
      }
    },
  };
};

export type SilenceActivityTracker = ReturnType<typeof makeSilenceActivityTracker>;
