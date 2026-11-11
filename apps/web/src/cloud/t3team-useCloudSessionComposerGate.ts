/**
 * Composer gate for optimistic cloud selection: queue the draft's first send until the VM is
 * Ready+connected with the project, and show its status banner with cancel/retry. The queued
 * send is persisted on the draft and delivered by the app-level `CloudQueuedSendFlusher`, so
 * nothing here has to stay mounted for the message to go out.
 */
import type { ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { CloudIcon } from "lucide-react";
import { createElement, useCallback, useMemo } from "react";

import type { ComposerBannerStackItem } from "~/components/chat/ComposerBannerStack";
import { useComposerDraftStore } from "~/composerDraftStore";
import { CloudQueuedSendBannerActions } from "./t3team-CloudQueuedSendBannerActions";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { applyCloudSessionCreateFailure } from "./t3team-applyCloudSessionCreateFailure";
import {
  cancelDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  retryDraftCloudQueuedSend,
  useDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import { getCloudSessionLocal } from "./t3team-cloudSessionLocalStore";
import { beginCloudSessionCreate, useCloudSessionTarget } from "./t3team-cloudSessionTargetStore";
import { restartDraftCloudQueuedSendWait } from "./t3team-cloudQueuedSendWaitRestart";
import { useCloudQueuedSendDispatching } from "./t3team-cloudQueuedSendDispatching";
import { logCloudProjectWaitCancelled } from "./t3team-cloudProjectWaitLog";
import { cloudProjectNotResolvedActions } from "./t3team-cloudProjectNotResolvedActions";
import { cloudSessionCreateSignInAction } from "./t3team-cloudSessionCreateSignInAction";
import { requestCloudSessionSignIn } from "./t3team-cloudSessionSignIn";
import {
  queuedSendEnvironmentIds,
  useCloudQueuedSendEnvironmentFacts,
} from "./t3team-useCloudQueuedSendEnvironmentFacts";
import { useCloudQueuedSendProjectWaitNow } from "./t3team-useCloudProjectWaitNow";
import { useCloudQueuedSendStepFacts } from "./t3team-useCloudQueuedSendStepFacts";
import { useCloudSessionController } from "./t3team-useCloudSessionController";
import {
  useCloudSessionProjectFollow,
  useCloudSessionProjectKey,
} from "./t3team-useCloudSessionProjectFollow";
import {
  queueCloudSessionSendIfNeeded,
  type CloudQueuedTurn,
} from "./t3team-cloudSessionQueueSend";
import type { CloudQueuedSendCardInput } from "./t3team-cloudSessionSetupModel";
import type { CloudSetupSessionSource } from "./t3team-useCloudSessionSetupCard";
import {
  currentCloudProjectWait,
  presentCloudQueuedSendProgress,
} from "./t3team-cloudQueuedSendSteps";

export function useCloudSessionComposerGate(input: {
  /** The composer's draft session; only a draft's first message can wait for a cloud session. */
  readonly draftId: string | null;
  /** Composer/draft/thread key the Run-on preference belongs to. */
  readonly scopeKey: string | null;
  /** The composer's project: stamped onto the queued send when the first message confirms it. */
  readonly projectRef: ScopedProjectRef | null;
}): {
  readonly tryQueueSend: (turn: CloudQueuedTurn) => CloudQueuedSend | null;
  readonly cancelQueuedSend: () => void;
  readonly bannerItem: ComposerBannerStackItem | null;
  readonly hasQueuedBind: boolean;
  /** The thread card's input while the draft's first message waits; null otherwise. */
  readonly card: CloudQueuedSendCardInput | null;
  /** The shared session list, so the setup card reads the same list and creates through it. */
  readonly cloud: CloudSetupSessionSource;
} {
  const cloud = useCloudSessionController({ scopeKey: input.scopeKey });
  const { draftId } = input;
  const target = useCloudSessionTarget(input.scopeKey);
  const navigate = useNavigate();
  const projectKey = useCloudSessionProjectKey(input.projectRef);
  useCloudSessionProjectFollow({
    scopeKey: input.scopeKey,
    draftId,
    projectKey,
    projectRef: input.projectRef,
    sessions: cloud.sessions,
  });

  const queued = useDraftCloudQueuedSend(draftId);
  const flushing = useCloudQueuedSendDispatching(queued?.messageId ?? null);

  const tryQueueSend = useCallback(
    (turn: CloudQueuedTurn) =>
      queueCloudSessionSendIfNeeded({ draftId, turn, sessions: cloud.sessions, projectKey }),
    [cloud.sessions, draftId, projectKey],
  );
  const retryQueuedSend = useCallback(() => {
    if (draftId === null) return;
    const parked = getDraftCloudQueuedSend(draftId);
    // A create failure has to start a new create: clearing the send's failure alone would
    // immediately fail again, because the Run-on target is still marked createFailed.
    if (parked?.failureKind === "create_failed" && input.scopeKey !== null) {
      const projectId =
        input.projectRef !== null && input.projectRef.environmentId === cloud.primaryEnvironmentId
          ? input.projectRef.projectId
          : undefined;
      const scopeKey = input.scopeKey;
      beginCloudSessionCreate(
        {
          scopeKey,
          projectKey,
          staleLocalSessionId: getCloudSessionLocal()?.session.sessionId ?? null,
        },
        undefined,
        () =>
          cloud.onCreate(projectId, {
            onFailed: (result) => applyCloudSessionCreateFailure(scopeKey, result, draftId),
          }),
      );
    }
    retryDraftCloudQueuedSend(draftId);
  }, [
    cloud.onCreate,
    cloud.primaryEnvironmentId,
    draftId,
    input.projectRef,
    input.scopeKey,
    projectKey,
  ]);
  const restartQueuedWait = useCallback(() => {
    if (draftId !== null) restartDraftCloudQueuedSendWait(draftId);
  }, [draftId]);

  const draft = useComposerDraftStore((state) =>
    draftId === null ? undefined : state.draftThreadsByThreadKey[draftId],
  );
  const machineFacts = useCloudQueuedSendEnvironmentFacts(
    queuedSendEnvironmentIds(queued === null ? [] : [queued], cloud.sessions),
  );
  const stepFacts = useCloudQueuedSendStepFacts({
    queued,
    draft,
    sessions: cloud.sessions,
    machineFacts,
    flushing,
  });
  const cancelQueuedSend = useCallback(() => {
    if (draftId === null) return;
    const waitingOnProject = stepFacts !== null && currentCloudProjectWait(stepFacts) !== null;
    logCloudProjectWaitCancelled({
      cancelled: cancelDraftCloudQueuedSend(draftId),
      waitingOnProject,
      environmentId: stepFacts?.session?.environmentId ?? null,
      reason: stepFacts?.projectWait?.reason ?? null,
      nowMs: Date.now(),
    });
  }, [draftId, stepFacts]);
  const signInAction = cloudSessionCreateSignInAction({
    createFailed: target?.createFailed,
    failureKind: queued?.failureKind,
    failureReason: target?.createFailureReason ?? queued?.failureReason,
    onSignIn: () => {
      const reason = target?.createFailureReason ?? queued?.failureReason;
      if (reason === "unauthorized" || reason === "repository_sign_in_required") {
        requestCloudSessionSignIn(retryQueuedSend, target?.createFailureHost);
        return;
      }
      if (reason === "connect_sign_in_required") {
        void navigate({ to: "/settings/connections" });
        return;
      }
      void navigate({ to: "/settings" });
    },
  });
  const recoveryActions = [
    ...cloudProjectNotResolvedActions({
      draftId,
      queued,
      scopeKey: input.scopeKey,
      projectKey,
      projectId:
        input.projectRef !== null && input.projectRef.environmentId === cloud.primaryEnvironmentId
          ? input.projectRef.projectId
          : undefined,
      createPending: cloud.createPending,
      onCreate: cloud.onCreate,
    }),
    ...(signInAction !== null ? [signInAction] : []),
  ];
  const projectWaitNow = useCloudQueuedSendProjectWaitNow(stepFacts);
  const canRetry = queued?.failureMessage !== undefined && queued.retryable !== false;

  const bannerItem = useMemo<ComposerBannerStackItem | null>(() => {
    if (stepFacts === null) return null;
    const view = presentCloudQueuedSendProgress(stepFacts, projectWaitNow);
    const notice = view.projectWait;
    const restart =
      notice !== null && notice.level === "slow" && !notice.blocking ? restartQueuedWait : null;
    return {
      id: `cloud-session-bind:${stepFacts.queued.messageId}`,
      variant: view.failed ? "error" : "info",
      priority: "activity",
      icon: createElement(CloudIcon, {
        className: view.failed ? "size-3" : "size-3 animate-pulse",
        "aria-hidden": true,
      }),
      title: view.title,
      description: stepFacts.queued.failureMessage ?? notice?.text ?? stepFacts.queued.sessionLabel,
      actions: createElement(CloudQueuedSendBannerActions, {
        onRetry: canRetry ? retryQueuedSend : restart,
        recoveryActions,
        onCancel: cancelQueuedSend,
        flushing: stepFacts.flushing,
      }),
    };
  }, [
    canRetry,
    cancelQueuedSend,
    projectWaitNow,
    recoveryActions,
    restartQueuedWait,
    retryQueuedSend,
    stepFacts,
  ]);

  return {
    tryQueueSend,
    cancelQueuedSend,
    bannerItem,
    hasQueuedBind: queued !== null,
    cloud: {
      sessions: cloud.sessions,
      loading: cloud.loading,
      loadError: cloud.loadError,
      refreshFailed: cloud.refreshFailed,
      onCreate: cloud.onCreate,
      createPending: cloud.createPending,
      primaryEnvironmentId: cloud.primaryEnvironmentId,
    },
    card:
      stepFacts === null
        ? null
        : {
            facts: stepFacts,
            onCancel: cancelQueuedSend,
            onRetry: canRetry ? retryQueuedSend : null,
            onRestartWait: restartQueuedWait,
            recoveryActions,
          },
  };
}
