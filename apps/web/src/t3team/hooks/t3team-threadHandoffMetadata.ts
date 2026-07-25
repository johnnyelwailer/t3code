import type { Thread } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readT3TeamThreadPlacementFromActivities(
  thread: Pick<Thread, "activities">,
): Pick<ProjectThread, "parentThreadId" | "ticketId"> {
  const activities = Array.isArray(thread.activities) ? thread.activities : [];

  for (const activity of activities.toReversed()) {
    if (activity.kind !== "t3team.handoff.created") {
      continue;
    }

    const payload =
      activity.payload && typeof activity.payload === "object" && !Array.isArray(activity.payload)
        ? (activity.payload as Record<string, unknown>)
        : null;

    if (!payload) {
      continue;
    }

    const parentThreadId = readNonEmptyString(payload.parentThreadId);
    const ticketId = readNonEmptyString(payload.ticketId);

    if (parentThreadId || ticketId) {
      return {
        ...(parentThreadId ? { parentThreadId } : {}),
        ...(ticketId ? { ticketId } : {}),
      };
    }
  }

  return {};
}

export function indexT3TeamChildParentThreads(
  threads: ReadonlyArray<Pick<Thread, "id" | "activities">>,
): ReadonlyMap<string, string> {
  const parentByChildId = new Map<string, string>();

  for (const thread of threads) {
    const activities = Array.isArray(thread.activities) ? thread.activities : [];
    for (const activity of activities) {
      if (activity.kind !== "t3team.handoff.started") continue;
      const payload =
        activity.payload && typeof activity.payload === "object" && !Array.isArray(activity.payload)
          ? (activity.payload as Record<string, unknown>)
          : null;
      const childThreadId = payload ? readNonEmptyString(payload.childThreadId) : undefined;
      if (childThreadId) parentByChildId.set(childThreadId, thread.id);
    }
  }

  return parentByChildId;
}
