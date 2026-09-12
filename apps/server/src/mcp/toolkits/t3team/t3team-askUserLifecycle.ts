/**
 * Pending-question lifecycle for t3team_ask_user (mcp/toolkits/t3team).
 *
 * Mirrors the shell's pending tally —
 * ProjectionPipeline.derivePendingUserInputCountFromActivities — exactly,
 * then restricts to responseMode "message" requests: provider-native
 * (synchronous) questions are provider-session-bound and flushed when their
 * turn terminates, so a stale one must not block a new durable question.
 *
 * @module mcp/toolkits/t3team/t3team-askUserLifecycle
 */
import type { ProjectionThreadActivity } from "../../../persistence/Services/ProjectionThreadActivities.ts";

/** requestId carried by a user-input lifecycle activity payload, or null. */
export const extractUserInputRequestId = (payload: unknown): string | null =>
  typeof payload === "object" &&
  payload !== null &&
  typeof (payload as Record<string, unknown>).requestId === "string"
    ? ((payload as Record<string, unknown>).requestId as string)
    : null;

const isStaleUserInputFailureDetail = (detail: string | null): boolean =>
  detail !== null &&
  (detail.includes("stale pending user-input request") ||
    detail.includes("unknown pending user-input request") ||
    detail.includes("unknown pending user input request") ||
    detail.includes("unknown pending codex user input request"));

/**
 * Message-mode request ids still open on the thread: requested, minus
 * resolved, minus stale/unknown respond failures (same clear rules the shell
 * count and the client use). Order by creation time, then activity id — the
 * rows arrive in sequence order, which is the same order.
 */
export const openMessageModeRequestIds = (
  activities: ReadonlyArray<ProjectionThreadActivity>,
): ReadonlyArray<string> => {
  const openRequestIds = new Set<string>();
  const messageModeRequestIds = new Set<string>();
  const ordered = [...activities].toSorted(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.activityId.localeCompare(right.activityId),
  );

  for (const activity of ordered) {
    const requestId = extractUserInputRequestId(activity.payload);
    if (requestId === null) {
      continue;
    }
    const payload =
      typeof activity.payload === "object" && activity.payload !== null
        ? (activity.payload as Record<string, unknown>)
        : null;
    const detail = typeof payload?.detail === "string" ? payload.detail.toLowerCase() : null;

    if (activity.kind === "user-input.requested") {
      openRequestIds.add(requestId);
      if (payload?.responseMode === "message") {
        messageModeRequestIds.add(requestId);
      }
      continue;
    }

    if (activity.kind === "user-input.resolved") {
      openRequestIds.delete(requestId);
      continue;
    }

    if (
      activity.kind === "provider.user-input.respond.failed" &&
      isStaleUserInputFailureDetail(detail)
    ) {
      openRequestIds.delete(requestId);
    }
  }

  return [...openRequestIds].filter((requestId) => messageModeRequestIds.has(requestId));
};
