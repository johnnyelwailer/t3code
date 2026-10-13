/**
 * App-level owner of queued cloud sends. Mounted once per window next to the other app
 * coordinators (not in ChatView), so a draft's first message is delivered when its cloud session
 * is ready even after the user navigated away or restarted the app. Renders nothing; the
 * cloud-session controller only mounts while something is queued.
 */
import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { useScratchProject } from "~/hooks/useScratchProject";
import { selectProjectGroupingSettings } from "~/logicalProject";
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
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import { decideCloudQueuedSendFlush } from "./t3team-cloudQueuedSendFlush";
import { stampDraftCloudQueuedSendStep, useCloudQueuedSends } from "./t3team-cloudQueuedSendStore";
import {
  getCloudSessionTargets,
  subscribeCloudSessionTargets,
} from "./t3team-cloudSessionTargetStore";
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

  useEffect(() => {
    const groupingSettings = selectProjectGroupingSettings(settings);
    const requests = requestsRef.current;
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
      });
      stampDraftCloudQueuedSendStep(draftId, {
        ...facts,
        queued,
        projectReady: facts.project !== null,
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
      });
    }
    pruneCloudQueuedSendRequests(requests, Object.values(queuedByDraft));
  }, [
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

  return null;
}
