import { useCallback, useEffect } from "react";
import { useCanGoBack } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ThreadChatView } from "~/t3work/chat/t3work-ThreadChatView";
import { OpenEmbeddedThreadControl } from "~/t3work/t3work-OpenEmbeddedThreadControl";
import type { ProjectThread, ViewState } from "~/t3work/t3work-types";
import { navigateBackWithFallback } from "~/t3work/t3work-historyBack";

export function AppThreadPane({
  view,
  threadProject,
  resolvedThread,
  onOpenTicket,
  onOpenEmbeddedThread,
  onThreadKickoffConsumed,
  onRememberFullThread,
  onBackToDashboard,
}: {
  view: Extract<ViewState, { type: "thread" }>;
  threadProject: ProjectShellProject | null;
  resolvedThread: ProjectThread | null;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenEmbeddedThread: (projectId: string, threadId: string) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onRememberFullThread: (threadId: string) => void;
  onBackToDashboard: (projectId: string) => void;
}) {
  const canGoBack = useCanGoBack();
  const canOpenEmbedded = Boolean(resolvedThread?.ticketId || resolvedThread?.dashboardMode);

  useEffect(() => {
    if (!resolvedThread) {
      return;
    }

    onRememberFullThread(resolvedThread.id);
  }, [onRememberFullThread, resolvedThread]);

  const handleBack = useCallback(() => {
    navigateBackWithFallback({
      canGoBack,
      onFallback: () => {
        if (resolvedThread?.ticketId) {
          onOpenTicket(view.projectId, resolvedThread.ticketId);
          return;
        }

        onBackToDashboard(view.projectId);
      },
    });
  }, [canGoBack, onBackToDashboard, onOpenTicket, resolvedThread?.ticketId, view.projectId]);

  return (
    <ThreadChatView
      threadId={view.threadId}
      projectId={view.projectId}
      projectTitle={threadProject?.title ?? view.projectId}
      {...(threadProject?.workspace?.rootPath
        ? { projectWorkspaceRoot: threadProject.workspace.rootPath }
        : {})}
      title={resolvedThread?.title ?? "New thread"}
      {...(resolvedThread?.kickoffMessage ? { kickoffMessage: resolvedThread.kickoffMessage } : {})}
      {...(resolvedThread?.kickoffPending !== undefined
        ? { kickoffPending: resolvedThread.kickoffPending }
        : {})}
      {...(resolvedThread?.kickoffWorkflow
        ? { kickoffWorkflow: resolvedThread.kickoffWorkflow }
        : {})}
      {...(resolvedThread?.kickoffPending && resolvedThread.kickoffMessage
        ? { initialUserMessage: resolvedThread.kickoffMessage }
        : {})}
      {...(resolvedThread?.kickoffModelSelection
        ? { initialModelSelection: resolvedThread.kickoffModelSelection }
        : {})}
      {...(resolvedThread?.kickoffRuntimeMode
        ? { initialRuntimeMode: resolvedThread.kickoffRuntimeMode }
        : {})}
      {...(resolvedThread?.kickoffInteractionMode
        ? { initialInteractionMode: resolvedThread.kickoffInteractionMode }
        : {})}
      {...(resolvedThread?.selectedToolIds !== undefined
        ? { selectedToolIds: resolvedThread.selectedToolIds }
        : {})}
      {...(resolvedThread?.ticketId ? { ticketId: resolvedThread.ticketId } : {})}
      {...(resolvedThread?.ticketDisplayId
        ? { ticketDisplayId: resolvedThread.ticketDisplayId }
        : {})}
      {...(resolvedThread && canOpenEmbedded
        ? {
            titleBarControlsAccessory: (
              <OpenEmbeddedThreadControl
                onOpen={() => onOpenEmbeddedThread(view.projectId, resolvedThread.id)}
              />
            ),
          }
        : {})}
      onInitialUserMessageSent={() => {
        if (resolvedThread) {
          onThreadKickoffConsumed(resolvedThread.id);
        }
      }}
      onBack={handleBack}
    />
  );
}
