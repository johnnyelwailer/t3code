/**
 * App-level owner of queued cloud sends. Mounted once per window next to the other app
 * coordinators (not in ChatView), so a draft's first message is delivered when its cloud session
 * is ready even after the user navigated away or restarted the app. Renders provider-ensure
 * children; the cloud-session controller only mounts while something is queued.
 */
import { selectProjectGroupingSettings } from "@t3tools/client-runtime/state/project-grouping";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { useScratchProject } from "~/hooks/useScratchProject";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import {
  applyCloudQueuedSendAction,
  connectRequestedFor,
  pruneCloudQueuedSendRequests,
  type CloudQueuedSendRequests,
} from "./t3team-cloudQueuedSendActions";
import {
  cloudProjectWaitDeadlineMs,
  isCloudProjectWaitExpired,
  trackMachineConnectedSince,
} from "./t3team-cloudProjectWaitBound";
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import { decideCloudQueuedSendFlush } from "./t3team-cloudQueuedSendFlush";
import { CloudQueuedSendProviderEnsure } from "./t3team-CloudQueuedSendProviderEnsureGate";
import {
  getCloudQueuedSendProviderReady,
  subscribeCloudQueuedSendProviderReady,
} from "./t3team-cloudQueuedSendProviderReadyStore";
import { stampDraftCloudQueuedSendStep, useCloudQueuedSends } from "./t3team-cloudQueuedSendStore";
import {
  getCloudSessionTargets,
  subscribeCloudSessionTargets,
} from "./t3team-cloudSessionTargetStore";
import {
  queuedSendEnvironmentIds,
  useCloudQueuedSendEnvironmentFacts,
} from "./t3team-useCloudQueuedSendEnvironmentFacts";
import { useCloudQueuedSendProviderEnsureTargets } from "./t3team-useCloudQueuedSendProviderEnsureTargets";
import { useCloudSessionController } from "./t3team-useCloudSessionController";

export function CloudQueuedSendFlusher() {
  const queued = useCloudQueuedSends();
  return Object.keys(queued).length === 0 ? null : <ActiveCloudQueuedSendFlusher />;
}

function ActiveCloudQueuedSendFlusher() {
  const queuedByDraft = useCloudQueuedSends();
  const cloud = useCloudSessionController();
  const targets = useSyncExternalStore(
    subscribeCloudSessionTargets,
    getCloudSessionTargets,
    getCloudSessionTargets,
  );
  const { environments } = useEnvironments();
  const projects = useProjects();
  const threadShells = useThreadShells();
  const settings = useClientSettings();
  const pathname = useLocation({ select: (location) => location.pathname });
  const draftThreadsByKey = useComposerDraftStore((state) => state.draftThreadsByThreadKey);
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn, { reportFailure: false });
  const { openScratchProject } = useScratchProject();
  const requestsRef = useRef<CloudQueuedSendRequests>(new Map());
  const connectedSinceRef = useRef(new Map<string, number>());
  const [boundClockMs, setBoundClockMs] = useState(0);
  const queuedList = Object.values(queuedByDraft);
  const machineFacts = useCloudQueuedSendEnvironmentFacts(
    queuedSendEnvironmentIds(queuedList, cloud.sessions),
  );
  const ensureTargets = useCloudQueuedSendProviderEnsureTargets({
    queuedByDraft,
    draftThreadsByKey,
    sessions: cloud.sessions,
    machineFacts,
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- flushes queued sends into connect/open-scratch/dispatch as session and provider facts change
  useEffect(() => {
    const flush = () => {
      const groupingSettings = selectProjectGroupingSettings(settings);
      const requests = requestsRef.current;
      const nowMs = Math.max(Date.now(), boundClockMs);
      let nextBoundMs: number | null = null;
      for (const [draftId, queued] of Object.entries(queuedByDraft)) {
        const draft = draftThreadsByKey[draftId];
        if (draft === undefined || draft.promotedTo) continue;
        const facts = resolveCloudQueuedSendFacts({
          queued,
          draft,
          sessions: cloud.sessions,
          environments,
          projects,
          threadShells,
          groupingSettings,
          bootstrapProjectIdOf: machineFacts.bootstrapProjectIdOf,
        });
        const connectedSince =
          facts.environmentId === null
            ? null
            : trackMachineConnectedSince(
                connectedSinceRef.current,
                facts.environmentId,
                facts.machineConnected,
                nowMs,
              );
        const deadlineMs = cloudProjectWaitDeadlineMs(queued, connectedSince);
        if (deadlineMs !== null && deadlineMs > nowMs && !queued.failureMessage) {
          nextBoundMs = Math.min(nextBoundMs ?? deadlineMs, deadlineMs);
        }
        const providerReady =
          facts.project === null ? true : getCloudQueuedSendProviderReady(queued.messageId);
        stampDraftCloudQueuedSendStep(draftId, {
          ...facts,
          queued,
          projectReady: facts.project !== null,
          providerReady,
        });
        const action = decideCloudQueuedSendFlush({
          queued,
          target: targets.get(draftId) ?? null,
          session: facts.session,
          connectFailure:
            connectRequestedFor(requests, queued.messageId) === queued.sessionId
              ? cloud.connectFailure
              : null,
          machineConnected: facts.machineConnected,
          projectId: facts.project?.id ?? null,
          scratch: facts.scratch,
          threadExists: facts.threadExists,
          projectWait: facts.projectWait,
          projectWaitExpired: isCloudProjectWaitExpired(queued, connectedSince, nowMs),
          environmentSessionEnded:
            facts.environmentId !== null && machineFacts.sessionEndedOf(facts.environmentId),
          providerReady,
        });
        applyCloudQueuedSendAction(action, {
          draftId,
          queued,
          threadId: draft.threadId,
          projectCwd: facts.project?.workspaceRoot ?? null,
          requests,
          draftPageOpen: pathname.includes(draftId),
          connect: cloud.onSessionAction,
          openScratchProject: (environmentId) =>
            openScratchProject(environmentId, "Could not open the cloud machine's folder"),
          startTurn,
          projectWaitLog: { nowMs, resolvedBy: facts.projectResolvedBy },
        });
      }
      pruneCloudQueuedSendRequests(requests, Object.values(queuedByDraft));
      if (nextBoundMs === null) return undefined;
      const deadlineMs = nextBoundMs;
      return setTimeout(() => setBoundClockMs(deadlineMs), deadlineMs - Date.now());
    };
    let timer = flush();
    const unsubscribe = subscribeCloudQueuedSendProviderReady(() => {
      if (timer !== undefined) clearTimeout(timer);
      timer = flush();
    });
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [
    boundClockMs,
    machineFacts,
    cloud,
    draftThreadsByKey,
    openScratchProject,
    environments,
    pathname,
    projects,
    queuedByDraft,
    settings,
    startTurn,
    targets,
    threadShells,
  ]);

  return (
    <>
      {ensureTargets.map((target) => (
        <CloudQueuedSendProviderEnsure
          key={target.messageId}
          queued={target.queued}
          environmentId={target.environmentId}
          projectReady={target.projectReady}
        />
      ))}
    </>
  );
}
