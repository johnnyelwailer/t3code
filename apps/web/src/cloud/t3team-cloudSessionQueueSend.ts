/**
 * Queue the first composer send against an optimistic cloud target. Returns the
 * queued payload when the send should wait for Ready+connect; null when the
 * caller should send on the current environment as usual.
 */
import type { CloudSession } from "@t3tools/contracts";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import {
  getCloudSessionTarget,
  requestCloudSessionBind,
  type CloudSessionQueuedSend,
} from "./t3team-cloudSessionTargetStore";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";

export function queueCloudSessionSendIfNeeded(input: {
  readonly scopeKey: string | null;
  readonly messageId: string;
  readonly messageText: string;
  readonly sessions: readonly CloudSession[];
  readonly availableEnvironmentIds: ReadonlySet<string>;
}): CloudSessionQueuedSend | null {
  if (input.scopeKey === null) return null;
  const target = getCloudSessionTarget(input.scopeKey);
  if (target === null) return null;
  if (target.sessionId === CLOUD_SESSION_CREATING_ID) {
    const queued = {
      messageId: input.messageId,
      messageText: input.messageText,
      createdAt: new Date().toISOString(),
    };
    return requestCloudSessionBind(input.scopeKey, queued) ? queued : null;
  }
  const session = input.sessions.find((item) => item.sessionId === target.sessionId);
  if (session === undefined) {
    const queued = {
      messageId: input.messageId,
      messageText: input.messageText,
      createdAt: new Date().toISOString(),
    };
    return requestCloudSessionBind(input.scopeKey, queued) ? queued : null;
  }
  if (isTerminalCloudSessionPhase(session.phase)) return null;
  // Ready+synced still queues briefly: bind-flush remaps then sends on the cloud
  // env in the next tick (same path as a still-provisioning session).
  const queued = {
    messageId: input.messageId,
    messageText: input.messageText,
    createdAt: new Date().toISOString(),
  };
  return requestCloudSessionBind(input.scopeKey, queued) ? queued : null;
}
