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
  useDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import { useCloudQueuedSendDispatching } from "./t3team-cloudQueuedSendDispatching";
import { logCloudProjectWaitCancelled } from "./t3team-cloudProjectWaitLog";
import { cloudProjectNotResolvedActions } from "./t3team-cloudProjectNotResolvedActions";
import {
  queuedSendEnvironmentIds,
  useCloudQueuedSendEnvironmentFacts,
} from "./t3team-useCloudQueuedSendEnvironmentFacts";
import { useCloudQueuedSendProjectWaitNow } from "./t3team-useCloudProjectWaitNow";
import { useCloudSessionController } from "./t3team-useCloudSessionController";
import {
  useCloudSessionProjectFollow,
  useCloudSessionProjectKey,
} from "./t3team-useCloudSessionProjectFollow";
import {
  queueCloudSessionSendIfNeeded,
  type CloudQueuedTurn,
} from "./t3team-cloudSessionQueueSend";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { selectProjectGroupingSettings } from "~/logicalProject";
import { useProjects } from "~/state/entities";
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import type { CloudQueuedSendCardInput } from "./t3team-cloudSessionSetupModel";
import type { CloudSetupSessionSource } from "./t3team-useCloudSessionSetupCard";
import {
  currentCloudProjectWait,
  presentCloudQueuedSendProgress,
  type CloudQueuedSendStepFacts,
} from "./t3team-cloudQueuedSendSteps";

export function useCloudSessionComposerGate(input: {
  /** The composer's draft session; only a draft's first message can wait for a cloud session. */
  readonly draftId: string | null;
  /** Composer/draft/thread key the Run-on preference belongs to. */
  readonly scopeKey: string | null;
  /** The composer's project: a cloud session set up for another one stops being the target. */
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
  const cloud = useCloudSessionController();
  const { draftId } = input;
  const projectKey = useCloudSessionProjectKey(input.projectRef);
  useCloudSessionProjectFollow({ scopeKey: input.scopeKey, projectKey });

  const queued = useDraftCloudQueuedSend(draftId);
  const flushing = useCloudQueuedSendDispatching(queued?.messageId ?? null);

  const tryQueueSend = useCallback(
    (turn: CloudQueuedTurn) =>
      queueCloudSessionSendIfNeeded({ draftId, turn, sessions: cloud.sessions }),
    [cloud.sessions, draftId],
  );
  const retryQueuedSend = useCallback(() => {
    if (draftId !== null) retryDraftCloudQueuedSend(draftId);
  }, [draftId]);

  const draft = useComposerDraftStore((state) =>
    draftId === null ? undefined : state.draftThreadsByThreadKey[draftId],
  );
  const { environments } = useEnvironments();
  const projects = useProjects();
  const settings = useClientSettings();
  const machineFacts = useCloudQueuedSendEnvironmentFacts(
    queuedSendEnvironmentIds(queued === null ? [] : [queued], cloud.sessions),
  );
  // The same facts the app-level flusher acts on; the card and the banner both render them.
  const stepFacts = useMemo<CloudQueuedSendStepFacts | null>(() => {
    if (queued === null || draft === undefined) return null;
    const facts = resolveCloudQueuedSendFacts({
      queued,
      draft,
      sessions: cloud.sessions,
      environments,
      projects,
      threadShells: [],
      groupingSettings: selectProjectGroupingSettings(settings),
      bootstrapProjectIdOf: machineFacts.bootstrapProjectIdOf,
    });
    return { ...facts, queued, projectReady: facts.project !== null, flushing };
  }, [cloud.sessions, draft, environments, flushing, machineFacts, projects, queued, settings]);
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
  const recoveryActions = cloudProjectNotResolvedActions({
    draftId,
    queued,
    scopeKey: input.scopeKey,
    projectKey,
    projectId:
      input.projectRef !== null && input.projectRef.environmentId === cloud.primaryEnvironmentId
        ? input.projectRef.projectId
        : undefined,
    onCreate: cloud.onCreate,
  });
  const projectWaitNow = useCloudQueuedSendProjectWaitNow(stepFacts);
  const canRetry = queued?.failureMessage !== undefined && queued.retryable !== false;

  const bannerItem = useMemo<ComposerBannerStackItem | null>(() => {
    if (stepFacts === null) return null;
    const view = presentCloudQueuedSendProgress(stepFacts, projectWaitNow);
    const action = (label: string, onClick: () => void) =>
      createElement(Button, { key: label, size: "xs", variant: "ghost", onClick }, label);
    return {
      id: `cloud-session-bind:${stepFacts.queued.messageId}`,
      variant: view.failed ? "error" : "info",
      priority: "activity",
      icon: createElement(CloudIcon, {
        className: view.failed ? "size-3" : "size-3 animate-pulse",
        "aria-hidden": true,
      }),
      title: view.title,
      description:
        stepFacts.queued.failureMessage ?? view.projectWait?.text ?? stepFacts.queued.sessionLabel,
      actions: createElement(
        Fragment,
        null,
        canRetry ? action("Retry", retryQueuedSend) : null,
        ...recoveryActions.map((item) => action(item.label, item.onClick)),
        // In flight the turn is already starting: it is delivered, not cancellable.
        stepFacts.flushing
          ? createElement(
              Button,
              { key: "sending", size: "xs", variant: "ghost", disabled: true },
              "Sending…",
            )
          : action("Cancel", cancelQueuedSend),
      ),
    };
  }, [canRetry, cancelQueuedSend, projectWaitNow, recoveryActions, retryQueuedSend, stepFacts]);

  return {
    tryQueueSend,
    cancelQueuedSend,
    bannerItem,
    hasQueuedBind: queued !== null,
    cloud: {
      sessions: cloud.sessions,
      loading: cloud.loading,
      onCreate: cloud.onCreate,
      primaryEnvironmentId: cloud.primaryEnvironmentId,
    },
    card:
      stepFacts === null
        ? null
        : {
            facts: stepFacts,
            onCancel: cancelQueuedSend,
            onRetry: canRetry ? retryQueuedSend : null,
            recoveryActions,
          },
  };
}
