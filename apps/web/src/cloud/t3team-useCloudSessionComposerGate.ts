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
import type { CloudQueuedSendCardInput } from "./t3team-CloudQueuedSendCard";
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import {
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
  /** The shared session controller, so the setup card reads the same list and creates through it. */
  readonly cloud: ReturnType<typeof useCloudSessionController>;
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

  const draft = useComposerDraftStore((state) =>
    draftId === null ? undefined : state.draftThreadsByThreadKey[draftId],
  );
  const { environments } = useEnvironments();
  const projects = useProjects();
  const settings = useClientSettings();
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
    });
    return { ...facts, queued, projectReady: facts.project !== null, flushing };
  }, [cloud.sessions, draft, environments, flushing, projects, queued, settings]);
  const canRetry = queued?.failureMessage !== undefined && queued.retryable !== false;

  const bannerItem = useMemo<ComposerBannerStackItem | null>(() => {
    if (stepFacts === null) return null;
    const view = presentCloudQueuedSendProgress(stepFacts, Date.now());
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
  }, [canRetry, cancelQueuedSend, retryQueuedSend, stepFacts]);

  return {
    tryQueueSend,
    cancelQueuedSend,
    bannerItem,
    hasQueuedBind: queued !== null,
    cloud,
    card:
      stepFacts === null
        ? null
        : {
            facts: stepFacts,
            onCancel: cancelQueuedSend,
            onRetry: canRetry ? retryQueuedSend : null,
          },
  };
}
