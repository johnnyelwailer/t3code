import { useMemo } from "react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH } from "@t3tools/project-recipes";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useProjects, useThread } from "~/state/entities";
import { summarizeT3TeamServerThread } from "~/t3team/chat/t3team-threadDebug";
import { buildThreadKickoffHistoryMessage } from "~/t3team/chat/t3team-threadKickoffHistoryMessage";
import {
  isWaitingForKickoffInput,
  shouldShowThreadKickoffPlaceholder,
} from "~/t3team/chat/t3team-threadKickoffPlaceholder";
import { resolveCanonicalProjectIdForWorkspaceRoot } from "~/t3team/hooks/t3team-threadBridge";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

type UseThreadChatServerStateInput = {
  readonly threadId: string;
  readonly projectId: string;
  readonly projectWorkspaceRoot: string | undefined;
  readonly kickoffMessage: string | undefined;
  readonly kickoffPending: boolean | undefined;
  readonly kickoffWorkflow: T3TeamKickoffWorkflow | undefined;
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
  const liveProjects = useProjects();
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
  const serverThread = useThread(threadRef);
  const hasServerThread = serverThread !== null;
  const serverThreadSummary = summarizeT3TeamServerThread(serverThread);
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
