/**
 * Builders for the durable artifacts a job-completion claim produces: the
 * pending-marker activity, the hidden user-message upsert command, and the
 * claimed-marker activity. Pure functions — see the module doc of
 * `t3team-jobNotificationFraming.ts` for the surrounding flow.
 *
 * @module t3team-jobNotificationFraming.builders
 */
import {
  EventId,
  type CommandId,
  type OrchestrationCommand,
  type OrchestrationThreadActivity,
  type ThreadId,
  type TurnId,
} from "@t3tools/contracts";
import {
  type JobNotificationMarker,
  JOB_NOTIFICATION_CLAIMED_KIND,
  JOB_NOTIFICATION_MARKER_KIND,
  jobNotificationClaimActivityId,
  jobNotificationMessageId,
} from "./t3team-jobNotificationFraming.ts";

/** Build the pending-marker activity persisted from `thread.metadata.updated`. */
export function buildJobNotificationMarkerActivity(input: {
  readonly eventId: string;
  readonly createdAt: string;
  readonly marker: JobNotificationMarker;
  readonly turnId: TurnId | null;
  readonly sequence?: number;
}): OrchestrationThreadActivity {
  return {
    id: EventId.make(input.eventId),
    createdAt: input.createdAt,
    tone: "info",
    kind: JOB_NOTIFICATION_MARKER_KIND,
    summary: "Job notification received",
    payload: {
      at: input.marker.atIso,
      text: input.marker.text,
      ...(input.marker.requestId !== undefined ? { requestId: input.marker.requestId } : {}),
      // Plumbing, not work: keep the marker out of the user-facing work log
      // (the client's isAgentInternalActivity filter skips timelineBypass rows).
      timelineBypass: true,
    },
    turnId: input.turnId,
    ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
  };
}

/** Build the hidden user-message upsert that frames the forced turn. */
export function buildJobNotificationFramingCommand(input: {
  readonly threadId: ThreadId;
  readonly commandId: CommandId;
  readonly marker: JobNotificationMarker;
  readonly markerActivityId: string;
  readonly nowIso: string;
}): OrchestrationCommand {
  return {
    type: "thread.message.upsert",
    commandId: input.commandId,
    threadId: input.threadId,
    message: {
      messageId: jobNotificationMessageId(input.markerActivityId),
      role: "user",
      text: input.marker.text,
      turnId: null,
      streaming: false,
      t3teamExt: {
        // Machine-driven forced turn: clients de-emphasize it exactly like an
        // inter-agent reaction turn (the web lane keys on this flag).
        notification: true,
        // Hidden from the human; the agent sees it as the turn's input.
        visibleToUser: false,
        author: { kind: "system" },
      },
    },
    createdAt: input.nowIso,
  };
}

/** Build the claimed-marker activity that makes the claim durable + once-only. */
export function buildJobNotificationClaimActivity(input: {
  readonly markerActivityId: string;
  readonly turnId: TurnId | null;
  readonly nowIso: string;
}): OrchestrationThreadActivity {
  return {
    id: jobNotificationClaimActivityId(input.markerActivityId),
    createdAt: input.nowIso,
    tone: "info",
    kind: JOB_NOTIFICATION_CLAIMED_KIND,
    summary: "Job notification claimed",
    payload: {
      markerActivityId: input.markerActivityId,
      turnId: input.turnId,
      timelineBypass: true,
    },
    turnId: input.turnId,
  };
}
