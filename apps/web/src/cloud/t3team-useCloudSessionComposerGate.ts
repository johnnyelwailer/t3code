/**
 * Composer gate for optimistic cloud selection: queue the draft's first send until the VM is
 * Ready+connected with the project, and show its status banner with cancel/retry. The queued
 * send is persisted on the draft and delivered by the app-level `CloudQueuedSendFlusher`, so
 * nothing here has to stay mounted for the message to go out.
 */
import type { ScopedProjectRef } from "@t3tools/contracts";
import { CloudIcon } from "lucide-react";
import { createElement, Fragment, useCallback, useMemo } from "react";

import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { Button } from "~/components/ui/button";
import { useEnvironments } from "~/state/environments";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  cancelDraftCloudQueuedSend,
  retryDraftCloudQueuedSend,
  useCloudQueuedSendDispatching,
  useDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import { useCloudSessionController } from "./t3team-useCloudSessionController";
import {
  useCloudSessionProjectFollow,
  useCloudSessionProjectKey,
} from "./t3team-useCloudSessionProjectFollow";
import {
  queueCloudSessionSendIfNeeded,
  type CloudQueuedTurn,
} from "./t3team-cloudSessionQueueSend";
import {
  cloudSessionBindBannerTitle,
  resolveCloudSessionBindPhase,
} from "./t3team-cloudSessionTargetLogic";

export function useCloudSessionComposerGate(input: {
  /** The composer's draft session; only a draft's first message can wait for a cloud session. */
  readonly draftId: string | null;
  /** Composer/draft/thread key the Run-on preference belongs to. */
  readonly scopeKey: string | null;
  /** The composer's project: a cloud session set up for another one stops being the target. */
  readonly projectRef: ScopedProjectRef | null;
  readonly availableEnvironmentIds: ReadonlySet<string>;
}): {
  readonly tryQueueSend: (turn: CloudQueuedTurn) => CloudQueuedSend | null;
  readonly cancelQueuedSend: () => void;
  readonly bannerItem: ComposerBannerStackItem | null;
  readonly hasQueuedBind: boolean;
} {
  const cloud = useCloudSessionController();
  const { draftId } = input;
  useCloudSessionProjectFollow({
    scopeKey: input.scopeKey,
    projectKey: useCloudSessionProjectKey(input.projectRef),
  });

  const queued = useDraftCloudQueuedSend(draftId);
  const flushing = useCloudQueuedSendDispatching(queued?.messageId ?? null);

  const tryQueueSend = useCallback(
    (turn: CloudQueuedTurn) =>
      queueCloudSessionSendIfNeeded({ draftId, turn, sessions: cloud.sessions }),
    [cloud.sessions, draftId],
  );
  const cancelQueuedSend = useCallback(() => {
    if (draftId !== null) cancelDraftCloudQueuedSend(draftId);
  }, [draftId]);
  const retryQueuedSend = useCallback(() => {
    if (draftId !== null) retryDraftCloudQueuedSend(draftId);
  }, [draftId]);

  const session =
    queued === null
      ? null
      : (cloud.sessions.find((item) => item.sessionId === queued.sessionId) ?? null);

  const { environments } = useEnvironments();
  const machineRegistered =
    session?.environmentId !== undefined &&
    environments.some(
      (environment) =>
        environment.environmentId === session.environmentId &&
        environment.connection.phase === "connected",
    );

  const bannerItem = useMemo<ComposerBannerStackItem | null>(() => {
    if (queued === null) return null;
    const phase = resolveCloudSessionBindPhase({
      sessionPhase: session?.phase ?? null,
      connecting: cloud.pendingKind === "connect",
      machineRegistered,
      projectReady:
        session?.environmentId !== undefined &&
        input.availableEnvironmentIds.has(session.environmentId),
      flushing,
      failed: queued.failureMessage !== undefined,
    });
    const action = (label: string, onClick: () => void) =>
      createElement(Button, { key: label, size: "xs", variant: "ghost", onClick }, label);
    return {
      id: `cloud-session-bind:${queued.messageId}`,
      variant: phase === "failed" ? "error" : "info",
      priority: "activity",
      icon: createElement(CloudIcon, {
        className: phase === "failed" ? "size-3" : "size-3 animate-pulse",
        "aria-hidden": true,
      }),
      title: cloudSessionBindBannerTitle(phase),
      description: queued.failureMessage ?? queued.sessionLabel,
      actions: createElement(
        Fragment,
        null,
        phase === "failed" && queued.retryable !== false ? action("Retry", retryQueuedSend) : null,
        // In flight the turn is already starting: it is delivered, not cancellable.
        flushing
          ? createElement(
              Button,
              { key: "sending", size: "xs", variant: "ghost", disabled: true },
              "Sending…",
            )
          : action("Cancel", cancelQueuedSend),
      ),
    };
  }, [
    cancelQueuedSend,
    cloud.pendingKind,
    flushing,
    input.availableEnvironmentIds,
    machineRegistered,
    queued,
    retryQueuedSend,
    session,
  ]);

  return { tryQueueSend, cancelQueuedSend, bannerItem, hasQueuedBind: queued !== null };
}
