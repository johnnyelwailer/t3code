/**
 * Composer gate for optimistic cloud selection: queue the first send until the
 * VM is Ready+connected with the project, show a status banner, and restore the
 * draft on cancel/failure.
 */
import type { CloudSession, EnvironmentId, MessageId } from "@t3tools/contracts";
import { CloudIcon } from "lucide-react";
import { createElement, useCallback, useMemo, useRef } from "react";

import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { Button } from "~/components/ui/button";
import { useCloudSessionController } from "./t3team-useCloudSessionController";
import { useCloudSessionBindFlush } from "./t3team-useCloudSessionBindFlush";
import { queueCloudSessionSendIfNeeded } from "./t3team-cloudSessionQueueSend";
import {
  cloudSessionBindBannerTitle,
  resolveCloudSessionBindPhase,
  CLOUD_SESSION_CREATING_ID,
} from "./t3team-cloudSessionTargetLogic";
import type { CloudSessionQueuedSend } from "./t3team-cloudSessionTargetStore";

export function useCloudSessionComposerGate(input: {
  readonly scopeKey: string | null;
  readonly availableEnvironmentIds: ReadonlySet<string>;
  readonly onRemapEnvironment: (environmentId: EnvironmentId) => void;
  readonly onFlushSend: (queued: CloudSessionQueuedSend) => void;
  readonly onRestoreDraft: (queued: CloudSessionQueuedSend) => void;
}): {
  readonly tryQueueSend: (
    messageId: MessageId,
    messageText: string,
  ) => CloudSessionQueuedSend | null;
  readonly cancelQueuedSend: () => void;
  readonly bannerItem: ComposerBannerStackItem | null;
  readonly hasQueuedBind: boolean;
} {
  const cloud = useCloudSessionController();
  const beginConnect = useCallback(
    (session: CloudSession) => {
      cloud.onSessionAction(session);
    },
    [cloud],
  );

  const pendingFlushRef = useRef<CloudSessionQueuedSend | null>(null);

  const { target, cancelQueuedSend } = useCloudSessionBindFlush({
    scopeKey: input.scopeKey,
    sessions: cloud.sessions,
    availableEnvironmentIds: input.availableEnvironmentIds,
    connectFailure: cloud.connectFailure,
    beginConnect,
    onFlush: (environmentId, queued) => {
      pendingFlushRef.current = queued;
      input.onRemapEnvironment(environmentId);
      // Remap is sync for project drafts; flush on the next tick so ChatView
      // sees the new environmentId before createThread/startTurn.
      queueMicrotask(() => {
        const next = pendingFlushRef.current;
        pendingFlushRef.current = null;
        if (next) input.onFlushSend(next);
      });
    },
    onRestoreDraft: input.onRestoreDraft,
  });

  const tryQueueSend = useCallback(
    (messageId: MessageId, messageText: string) =>
      queueCloudSessionSendIfNeeded({
        scopeKey: input.scopeKey,
        messageId,
        messageText,
        sessions: cloud.sessions,
        availableEnvironmentIds: input.availableEnvironmentIds,
      }),
    [cloud.sessions, input.availableEnvironmentIds, input.scopeKey],
  );

  const session =
    target === null || target.sessionId === CLOUD_SESSION_CREATING_ID
      ? null
      : (cloud.sessions.find((item) => item.sessionId === target.sessionId) ?? null);

  const bannerItem = useMemo<ComposerBannerStackItem | null>(() => {
    if (target === null || !target.bindRequested) return null;
    const phase = resolveCloudSessionBindPhase({
      sessionPhase: session?.phase ?? null,
      connecting: cloud.pendingKind === "connect",
      projectReady:
        session?.environmentId !== undefined &&
        input.availableEnvironmentIds.has(session.environmentId),
      flushing: false,
      failed: target.failureMessage !== null,
    });
    return {
      id: `cloud-session-bind:${target.sessionId}`,
      variant: phase === "failed" ? "error" : "info",
      priority: "activity",
      icon: createElement(CloudIcon, { className: "size-3 animate-pulse", "aria-hidden": true }),
      title: cloudSessionBindBannerTitle(phase),
      description: target.failureMessage ?? target.label,
      actions: createElement(
        Button,
        { size: "xs", variant: "ghost", onClick: cancelQueuedSend },
        "Cancel",
      ),
    };
  }, [cancelQueuedSend, cloud.pendingKind, input.availableEnvironmentIds, session, target]);

  return {
    tryQueueSend,
    cancelQueuedSend,
    bannerItem,
    hasQueuedBind: target?.bindRequested === true && target.queuedSend !== null,
  };
}
