import { useMemo } from "react";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH } from "@t3tools/project-recipes";
import { useShallow } from "zustand/react/shallow";

import { usePrimaryEnvironmentId } from "~/environments/primary";
import { selectProjectsAcrossEnvironments, useStore } from "~/store";
import { createThreadSelectorByRef } from "~/storeSelectors";
import { summarizeT3WorkServerThread } from "~/t3work/chat/t3work-threadDebug";
import { buildThreadKickoffHistoryMessage } from "~/t3work/chat/t3work-threadKickoffHistoryMessage";
import {
  isWaitingForKickoffInput,
  shouldShowThreadKickoffPlaceholder,
} from "~/t3work/chat/t3work-threadKickoffPlaceholder";
import { resolveCanonicalProjectIdForWorkspaceRoot } from "~/t3work/hooks/t3work-threadBridge";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

type UseThreadChatServerStateInput = {
  readonly threadId: string;
  readonly projectId: string;
  readonly projectWorkspaceRoot: string | undefined;
  readonly kickoffMessage: string | undefined;
  readonly kickoffPending: boolean | undefined;
  readonly kickoffWorkflow: T3workKickoffWorkflow | undefined;
};

export function useThreadChatServerState({
  threadId,
  projectId,
  projectWorkspaceRoot,
  kickoffMessage,
  kickoffPending,
  kickoffWorkflow,
}: UseThreadChatServerStateInput) {
  const environmentId = usePrimaryEnvironmentId();
  const liveProjects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const canonicalProjectId = useMemo(
    () => resolveCanonicalProjectIdForWorkspaceRoot(projectWorkspaceRoot, projectId, liveProjects),
    [liveProjects, projectId, projectWorkspaceRoot],
  );
  const projectExists = useMemo(
    () => liveProjects.some((candidate) => candidate.id === canonicalProjectId),
    [canonicalProjectId, liveProjects],
  );
  const threadRef = useMemo(
    () => (environmentId ? scopeThreadRef(environmentId, threadId as never) : null),
    [environmentId, threadId],
  );
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const hasServerThread = serverThread !== undefined;
  const serverThreadSummary = summarizeT3WorkServerThread(serverThread);
  const serverMessageCount =
    typeof serverThreadSummary?.messageCount === "number" ? serverThreadSummary.messageCount : 0;
  const hasServerLaunchActivity =
    serverThread?.activities.some(
      (activity) => activity.kind === PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH,
    ) ?? false;
  const useKickoffHistoryMessage = isWaitingForKickoffInput(kickoffWorkflow, kickoffPending);
  const kickoffHistoryMessage = useMemo(
    () =>
      serverThread
        ? buildThreadKickoffHistoryMessage({
            threadId,
            createdAt: serverThread.createdAt,
            kickoffMessage,
            kickoffPending,
            kickoffWorkflow,
          })
        : undefined,
    [serverThread, threadId, kickoffMessage, kickoffPending, kickoffWorkflow],
  );
  const showKickoffPlaceholder =
    shouldShowThreadKickoffPlaceholder({
      kickoffMessage,
      serverMessageCount,
      hasServerLaunchActivity,
    }) && !useKickoffHistoryMessage;

  return {
    environmentId,
    canonicalProjectId,
    projectExists,
    serverThread,
    hasServerThread,
    serverThreadSummary,
    hasServerLaunchActivity,
    kickoffHistoryMessage,
    showKickoffPlaceholder,
  };
}
