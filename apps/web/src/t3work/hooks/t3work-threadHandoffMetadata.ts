import type { Thread } from "~/types";
import type { ProjectThread } from "~/t3work/t3work-types";

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readHandoffThreadAttachmentMetadata(
  thread: Pick<Thread, "activities">,
): Pick<ProjectThread, "parentThreadId" | "ticketId"> {
  const activities = Array.isArray(thread.activities) ? thread.activities : [];

  for (const activity of activities.toReversed()) {
    if (activity.kind !== "t3work.handoff.created") {
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
