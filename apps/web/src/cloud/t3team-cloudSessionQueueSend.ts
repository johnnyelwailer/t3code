/**
 * Queue a draft's first composer send against an optimistic cloud target. Returns the queued
 * record (persisted on the draft) when the send should wait for the session; null when the
 * caller should send on the current environment as usual.
 */
import type { CloudSession } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import { getCloudSessionTarget } from "./t3team-cloudSessionTargetStore";

/** The turn as the composer prepared it; the session fields come from the draft's target. */
export type CloudQueuedTurn = Omit<
  CloudQueuedSend,
  "sessionId" | "sessionLabel" | "projectKey" | "createdAt"
>;

export function queueCloudSessionSendIfNeeded(input: {
  readonly draftId: string | null;
  readonly turn: CloudQueuedTurn;
  readonly sessions: readonly CloudSession[];
  readonly now?: () => Date;
}): CloudQueuedSend | null {
  if (input.draftId === null) return null;
  const target = getCloudSessionTarget(input.draftId);
  if (target === null) return null;
  const session = input.sessions.find((item) => item.sessionId === target.sessionId);
  if (session !== undefined && isTerminalCloudSessionPhase(session.phase)) return null;
  // A ready, synced session still queues: the app-level flusher sends it within a tick, on the
  // same path as one that is still provisioning.
  const createdAt = (input.now?.() ?? new Date()).toISOString();
  const queued: CloudQueuedSend = {
    ...input.turn,
    sessionId: target.sessionId,
    sessionLabel: target.label,
    projectKey: target.projectKey,
    createdAt,
    stepStartedAt: { queued: createdAt },
  };
  return writeDraftCloudQueuedSend(input.draftId, queued) ? queued : null;
}
