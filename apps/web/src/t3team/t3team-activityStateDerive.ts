/**
 * GHE #208 — the deterministic activity word of a working thread, derived on the client from its
 * V2 turn items (the server no longer persists one). Zero inference: it reads which item of the
 * active run is in flight.
 *
 * - a pending approval / question → `waiting` (the user acts next)
 * - a streaming or running reasoning item → `thinking`
 * - a streaming assistant message → `writing`
 * - any other running item (command, file change, search, tool, subagent) → `working`
 * - nothing in flight while the run is live → `thinking` (the model is between items)
 */
import type { OrchestrationV2TurnItem, RunId } from "@t3tools/contracts";

import type { ActivityState } from "~/t3team/t3team-activityStateDisplay";

/** Only the tail of the projection can hold the active run's live item; bound the scan. */
const MAX_SCANNED_ITEMS = 64;

const isInFlight = (item: OrchestrationV2TurnItem): boolean =>
  item.status === "running" ||
  item.status === "pending" ||
  item.status === "waiting" ||
  ((item.type === "assistant_message" || item.type === "reasoning") && item.streaming);

function itemActivityState(item: OrchestrationV2TurnItem): ActivityState | null {
  switch (item.type) {
    case "reasoning":
      return "thinking";
    case "assistant_message":
      return "writing";
    case "user_input_request":
    case "approval_request":
      return "waiting";
    case "user_message":
    case "notification":
    case "system_notice":
    case "todo_list":
    case "proposed_plan":
    case "checkpoint":
      return null;
    default:
      return "working";
  }
}

export function deriveT3TeamActivityState(input: {
  /** The thread has a live run (ChatView's `isWorking`). */
  readonly isWorking: boolean;
  /** A pending approval or question is docked in the composer. */
  readonly waitingOnUser: boolean;
  readonly activeRunId: RunId | null;
  /** The thread's turn items in timeline order (the projection's `turnItems`). */
  readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
}): ActivityState | null {
  if (!input.isWorking) return null;
  if (input.waitingOnUser) return "waiting";
  const { turnItems, activeRunId } = input;
  const stop = Math.max(0, turnItems.length - MAX_SCANNED_ITEMS);
  for (let index = turnItems.length - 1; index >= stop; index -= 1) {
    const item = turnItems[index];
    if (item === undefined || (activeRunId !== null && item.runId !== activeRunId)) continue;
    if (!isInFlight(item)) continue;
    const state = itemActivityState(item);
    if (state !== null) return state;
  }
  return "thinking";
}
