/**
 * Job-completion notification framing for provider-originated forced turns.
 *
 * The distribution pack marks a job-completion wake on
 * `thread.metadata.updated` (`payload.metadata.lastJobNotification =
 * { at, text, requestId? }`) right before it raises a follow-up turn on an
 * idle thread. The host persists that marker as a durable activity (kind
 * `job-notification.pending`, activity id = provider event id, replay-safe)
 * and consumes it exactly once: on the next provider-originated
 * `turn.started` it upserts the marker's notification text as a hidden
 * `role:"user"` message (t3teamExt notification/visibleToUser/author system)
 * and records a `job-notification.claimed` activity, so the marker is never
 * consumed twice. Both activities carry `timelineBypass: true`, keeping the
 * plumbing out of the user-facing work log.
 *
 * Recency: a marker older than ~5 minutes (plus a clock-skew tolerance) is
 * dropped — its forced turn already happened, and a much later provider turn
 * must not be retroactively framed as a notification.
 *
 * @module t3team-jobNotificationFraming
 */
import {
  EventId,
  MessageId,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";

/** Durable activity kind for a persisted (not yet consumed) job-notification marker. */
export const JOB_NOTIFICATION_MARKER_KIND = "job-notification.pending";
/** Durable activity kind recording which marker a forced turn consumed. */
export const JOB_NOTIFICATION_CLAIMED_KIND = "job-notification.claimed";
/** Markers older than this are stale: their forced turn already happened (or was lost). */
export const JOB_NOTIFICATION_MARKER_MAX_AGE_MS = 5 * 60 * 1000;
/** Tolerated marker-vs-host clock skew before a "future" marker is accepted. */
export const JOB_NOTIFICATION_MARKER_CLOCK_SKEW_MS = 60 * 1000;

/** The marker the pack stamps on `thread.metadata.updated` at job completion. */
export interface JobNotificationMarker {
  readonly atIso: string;
  readonly text: string;
  readonly requestId?: string;
}

/**
 * Parse a job-notification marker record. Used both for the wire form
 * (`thread.metadata.updated` `payload.metadata.lastJobNotification`) and for
 * the persisted marker-activity payload, which mirrors the same fields.
 * Defensive on purpose: the wire record is an untyped bag (other providers put
 * arbitrary keys in `metadata`), so every field is shape-checked and anything
 * malformed yields `undefined` (no marker, no activity).
 */
export function parseJobNotificationMarker(
  record: unknown,
): JobNotificationMarker | undefined {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return undefined;
  }
  const entry = record as Record<string, unknown>;
  const atIso = entry.at;
  const text = entry.text;
  if (typeof atIso !== "string" || Number.isNaN(Date.parse(atIso))) {
    return undefined;
  }
  const trimmedText = typeof text === "string" ? text.trim() : "";
  if (trimmedText.length === 0) {
    return undefined;
  }
  const requestId =
    typeof entry.requestId === "string" && entry.requestId.length > 0
      ? entry.requestId
      : undefined;
  return { atIso, text: trimmedText, ...(requestId !== undefined ? { requestId } : {}) };
}

/**
 * Deterministic ids for the claim artifacts, keyed on the marker activity id
 * (which is the provider event id and therefore unique per marker): a
 * replayed `turn.started` re-dispatches the same upsert (same message id →
 * projector upsert is a no-op) and the same claimed activity (same activity
 * id → projector conflict-ignore is a no-op).
 */
export function jobNotificationMessageId(markerActivityId: string): MessageId {
  return MessageId.make(`job-notification:${markerActivityId}`);
}

export function jobNotificationClaimActivityId(markerActivityId: string): EventId {
  return EventId.make(`job-notification-claimed:${markerActivityId}`);
}

/** The claimable marker, if any: the newest fresh marker with no claimed record. */
export interface JobNotificationClaim {
  readonly marker: JobNotificationMarker;
  readonly markerActivityId: string;
}

/**
 * Pick the marker a provider-originated forced turn consumes: the NEWEST
 * pending marker that is fresh at `nowIso` and has not been claimed yet. When
 * the pack coalesces several completions into one wake there is exactly one
 * marker; if several are pending, the wake was raised by the most recent
 * completion, so it claims that one (the rest expire via the recency window).
 */
export function findClaimableJobNotificationMarker(
  activities: ReadonlyArray<OrchestrationThreadActivity> | undefined,
  nowIso: string,
): JobNotificationClaim | undefined {
  if (activities === undefined || activities.length === 0) {
    return undefined;
  }
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) {
    return undefined;
  }
  const claimedMarkerActivityIds = new Set<string>();
  for (const activity of activities) {
    if (activity.kind !== JOB_NOTIFICATION_CLAIMED_KIND) {
      continue;
    }
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    if (typeof payload?.markerActivityId === "string") {
      claimedMarkerActivityIds.add(payload.markerActivityId);
    }
  }

  let claim: JobNotificationClaim | undefined;
  let claimAtMs = Number.NaN;
  for (const activity of activities) {
    if (activity.kind !== JOB_NOTIFICATION_MARKER_KIND) {
      continue;
    }
    if (claimedMarkerActivityIds.has(activity.id)) {
      continue;
    }
    const marker = parseJobNotificationMarker(activity.payload);
    if (marker === undefined) {
      continue;
    }
    const atMs = Date.parse(marker.atIso);
    const ageMs = nowMs - atMs;
    if (
      ageMs < -JOB_NOTIFICATION_MARKER_CLOCK_SKEW_MS ||
      ageMs > JOB_NOTIFICATION_MARKER_MAX_AGE_MS
    ) {
      continue;
    }
    if (!Number.isNaN(claimAtMs) && atMs <= claimAtMs) {
      continue;
    }
    claim = { marker, markerActivityId: activity.id };
    claimAtMs = atMs;
  }
  return claim;
}
