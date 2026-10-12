/**
 * After the user sends while a cloud session is only an optimistic preference:
 * connect when Ready, wait for the project to appear on that machine, then hand
 * the queued message back to ChatView to flush on the remapped draft.
 */
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useRef } from "react";

import { isTerminalCloudSessionPhase } from "~/components/cloud/t3team-cloudSessionSplit";
import {
  clearCloudSessionQueuedSend,
  clearCloudSessionTarget,
  failCloudSessionBind,
  useCloudSessionTarget,
  type CloudSessionQueuedSend,
} from "./t3team-cloudSessionTargetStore";
import { CLOUD_SESSION_CREATING_ID } from "./t3team-cloudSessionTargetLogic";
import { useCloudSessionLocal } from "./t3team-cloudSessionLocalStore";

export function useCloudSessionBindFlush(input: {
  readonly scopeKey: string | null;
  readonly sessions: readonly CloudSession[];
  readonly availableEnvironmentIds: ReadonlySet<string>;
  readonly connectFailure: { readonly sessionId: string; readonly message: string } | null;
  readonly beginConnect: (session: CloudSession) => void;
  readonly onFlush: (environmentId: EnvironmentId, queued: CloudSessionQueuedSend) => void;
  readonly onRestoreDraft: (queued: CloudSessionQueuedSend) => void;
}): {
  readonly target: ReturnType<typeof useCloudSessionTarget>;
  readonly cancelQueuedSend: () => void;
} {
  const target = useCloudSessionTarget(input.scopeKey);
  const localSession = useCloudSessionLocal();
  const connectingRef = useRef<string | null>(null);
  const flushedRef = useRef<string | null>(null);
  const beginConnectRef = useRef(input.beginConnect);
  const onFlushRef = useRef(input.onFlush);
  const onRestoreRef = useRef(input.onRestoreDraft);
  beginConnectRef.current = input.beginConnect;
  onFlushRef.current = input.onFlush;
  onRestoreRef.current = input.onRestoreDraft;

  const session =
    target === null || target.sessionId === CLOUD_SESSION_CREATING_ID
      ? null
      : (input.sessions.find((item) => item.sessionId === target.sessionId) ??
        (localSession?.session.sessionId === target.sessionId ? localSession.session : null));

  useEffect(() => {
    if (input.scopeKey === null || target === null || !target.bindRequested) return;
    if (session === null) return;

    if (isTerminalCloudSessionPhase(session.phase)) {
      const queued = failCloudSessionBind(
        input.scopeKey,
        session.failureReason ?? "Cloud session ended before it could connect.",
      );
      if (queued) onRestoreRef.current(queued);
      return;
    }

    if (input.connectFailure !== null && input.connectFailure.sessionId === session.sessionId) {
      const queued = failCloudSessionBind(input.scopeKey, input.connectFailure.message);
      if (queued) onRestoreRef.current(queued);
      connectingRef.current = null;
      return;
    }

    if (session.phase !== "ready") return;

    const environmentId = session.environmentId;
    if (environmentId !== undefined && input.availableEnvironmentIds.has(environmentId)) {
      if (flushedRef.current === target.queuedSend?.messageId) return;
      const queued = target.queuedSend;
      if (queued === null) return;
      flushedRef.current = queued.messageId;
      clearCloudSessionTarget(input.scopeKey);
      onFlushRef.current(environmentId as EnvironmentId, queued);
      return;
    }

    // Broker sessions mint environmentId only once the VM reports in — connect
    // before that fails with "still starting", so wait for the id first.
    if (session.transport === "nexi_broker" && environmentId === undefined) return;

    if (connectingRef.current !== session.sessionId) {
      connectingRef.current = session.sessionId;
      beginConnectRef.current(session);
    }
  }, [input.availableEnvironmentIds, input.connectFailure, input.scopeKey, session, target]);

  const cancelQueuedSend = useCallback(() => {
    if (input.scopeKey === null) return;
    const queued = clearCloudSessionQueuedSend(input.scopeKey);
    connectingRef.current = null;
    flushedRef.current = null;
    if (queued) onRestoreRef.current(queued);
  }, [input.scopeKey]);

  return { target, cancelQueuedSend };
}
