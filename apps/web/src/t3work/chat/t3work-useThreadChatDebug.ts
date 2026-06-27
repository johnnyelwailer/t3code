import { useEffect } from "react";

import { recordT3WorkThreadDebug } from "~/t3work/chat/t3work-threadDebug";

type ThreadChatDebugInput = {
  environmentId: string | null | undefined;
  projectId: string;
  threadId: string;
  projectWorkspaceRoot: string | undefined;
  canonicalProjectId: string;
  projectExists: boolean;
  hasInitialUserMessage: boolean;
  hasServerThread: boolean;
  serverThreadSummary: Record<string, unknown> | null;
};

export function useThreadChatDebug({
  environmentId,
  projectId,
  threadId,
  projectWorkspaceRoot,
  canonicalProjectId,
  projectExists,
  hasInitialUserMessage,
  hasServerThread,
  serverThreadSummary,
}: ThreadChatDebugInput) {
  useEffect(() => {
    recordT3WorkThreadDebug("thread-chat-view.handoff", {
      environmentId,
      routeProjectId: projectId,
      threadId,
      projectWorkspaceRoot: projectWorkspaceRoot ?? null,
      canonicalProjectId,
      projectExists,
      hasInitialUserMessage,
      serverThread: serverThreadSummary,
    });
  }, [
    canonicalProjectId,
    environmentId,
    hasInitialUserMessage,
    projectExists,
    projectId,
    projectWorkspaceRoot,
    serverThreadSummary,
    threadId,
  ]);

  useEffect(() => {
    if (!hasServerThread) {
      recordT3WorkThreadDebug("thread-chat-view.thread-state.skipped", {
        reason: "missing-server-thread",
        threadId,
      });
      return;
    }

    recordT3WorkThreadDebug("thread-chat-view.thread-state", {
      environmentId,
      threadId,
      serverThread: serverThreadSummary,
    });
  }, [environmentId, hasServerThread, serverThreadSummary, threadId]);
}
