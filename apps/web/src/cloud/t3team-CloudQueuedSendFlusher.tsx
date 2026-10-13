/**
 * App-level owner of queued cloud sends. Mounted once per window next to the other app
 * coordinators (not in ChatView), so a draft's first message is delivered when its cloud session
 * is ready even after the user navigated away or restarted the app. Renders nothing; the
 * cloud-session controller only mounts while something is queued.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "~/composerDraftStore";
import { useClientSettings } from "~/hooks/useSettings";
import { selectProjectGroupingSettings } from "~/logicalProject";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { completeCloudQueuedSend, dispatchCloudQueuedSend } from "./t3team-cloudQueuedSendDispatch";
import { resolveCloudQueuedSendFacts } from "./t3team-cloudQueuedSendFacts";
import { decideCloudQueuedSendFlush } from "./t3team-cloudQueuedSendFlush";
import {
  failDraftCloudQueuedSend,
  updateDraftCloudQueuedSend,
  useCloudQueuedSends,
} from "./t3team-cloudQueuedSendStore";
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
  // messageId -> session a connect was requested for since the last (re)try. A connect failure
  // only parks the message when this flusher asked for that connect.
  const connectRequestedRef = useRef(new Map<string, string>());

  useEffect(() => {
    const groupingSettings = selectProjectGroupingSettings(settings);
    // Off the draft's own page the promoted draft is retired at once; on it, the thread route
    // takes over and retires it when the thread has started.
    const retireIfAway = (draftId: string, environmentId: EnvironmentId, threadId: ThreadId) => {
      if (pathname.includes(draftId)) return;
      finalizePromotedDraftThreadByRef(scopeThreadRef(environmentId, threadId));
    };
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
      const target = targets.get(draftId) ?? null;
      const requestedFor = connectRequestedRef.current.get(queued.messageId);
      const action = decideCloudQueuedSendFlush({
        queued,
        target,
        session: facts.session,
        connectFailure: requestedFor === queued.sessionId ? cloud.connectFailure : null,
        machineConnected: facts.machineConnected,
        projectId: facts.project?.id ?? null,
        threadExists: facts.threadExists,
      });
      switch (action.kind) {
        case "wait":
          break;
        case "resolve-session":
          updateDraftCloudQueuedSend(draftId, queued.messageId, (current) => ({
            ...current,
            sessionId: action.sessionId,
            sessionLabel: action.label,
          }));
          break;
        case "connect":
          if (requestedFor !== action.session.sessionId) {
            connectRequestedRef.current.set(queued.messageId, action.session.sessionId);
            cloud.onSessionAction(action.session);
          }
          break;
        case "fail":
          connectRequestedRef.current.delete(queued.messageId);
          failDraftCloudQueuedSend(draftId, queued.messageId, action.message, action.retryable);
          break;
        case "delivered":
          completeCloudQueuedSend(draftId, action.environmentId, draft.threadId);
          retireIfAway(draftId, action.environmentId, draft.threadId);
          break;
        case "dispatch":
          void dispatchCloudQueuedSend({
            draftId,
            messageId: queued.messageId,
            environmentId: action.environmentId,
            projectId: action.projectId,
            projectCwd: facts.project?.workspaceRoot ?? null,
            startTurn,
          }).then((outcome) => {
            if (outcome === "sent") retireIfAway(draftId, action.environmentId, draft.threadId);
          });
          break;
      }
    }
    // Retried or cleared messages start over with a fresh connect.
    for (const messageId of connectRequestedRef.current.keys()) {
      const stillQueued = Object.values(queuedByDraft).some(
        (queued) => queued.messageId === messageId && queued.failureMessage === undefined,
      );
      if (!stillQueued) connectRequestedRef.current.delete(messageId);
    }
  }, [
    cloud,
    draftThreadsByKey,
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
