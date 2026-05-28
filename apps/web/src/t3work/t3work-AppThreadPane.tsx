import { useCallback, useEffect } from "react";
import { PanelRightOpenIcon } from "lucide-react";
import { useCanGoBack } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ThreadChatView } from "~/t3work/chat/t3work-ThreadChatView";
import { Button } from "~/t3work/components/ui/t3work-button";
import type { ProjectThread, ViewState } from "~/t3work/t3work-types";
import { navigateBackWithFallback } from "~/t3work/t3work-historyBack";
import { runT3workViewTransition } from "~/t3work/t3work-runViewTransition";

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
      {...(resolvedThread && canOpenEmbedded
        ? {
            headerAccessory: (
              <Button
                size="icon-xs"
                variant="ghost"
                className="shrink-0 text-muted-foreground/80"
                onClick={() =>
                  runT3workViewTransition(() =>
                    onOpenEmbeddedThread(view.projectId, resolvedThread.id),
                  )
                }
                aria-label="Open side-by-side view"
                title="Open side-by-side view"
              >
                <PanelRightOpenIcon className="size-4" />
              </Button>
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
