import { useCallback, useEffect } from "react";
import { PanelRightOpenIcon, XIcon } from "lucide-react";
import { useCanGoBack } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ThreadChatView } from "~/t3team/chat/t3team-ThreadChatView";
import { Button } from "~/t3team/components/ui/t3team-button";
import type { ProjectThread, ViewState } from "~/t3team/t3team-types";
import { navigateBackWithFallback } from "~/t3team/t3team-historyBack";
import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

export function AppThreadPane({
  view,
  threadProject,
  resolvedThread,
  embeddedThread,
  onOpenTicket,
  onOpenEmbeddedThread,
  onCloseEmbeddedThread,
  onThreadKickoffConsumed,
  onRememberFullThread,
  onBackToDashboard,
}: {
  view: Extract<ViewState, { type: "thread" }>;
  threadProject: ProjectShellProject | null;
  resolvedThread: ProjectThread | null;
  embeddedThread: ProjectThread | null;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenEmbeddedThread: (projectId: string, threadId: string) => void;
  onCloseEmbeddedThread: () => void;
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

  const parentChat = (
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
              <Button
                size="icon-xs"
                variant="ghost"
                className="shrink-0 text-muted-foreground/80"
                onClick={() =>
                  runT3TeamViewTransition(() =>
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

  const embeddedThreadId = embeddedThread?.id ?? view.embeddedThreadId;
  if (!embeddedThreadId) {
    return parentChat;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 divide-x divide-border overflow-hidden">
      <div className="flex min-w-0 flex-1">{parentChat}</div>
      <div className="relative flex min-w-0 flex-1">
        <Button
          size="icon-xs"
          variant="ghost"
          className="absolute right-2 top-2 z-10 shrink-0 text-muted-foreground/80"
          onClick={() => runT3TeamViewTransition(onCloseEmbeddedThread)}
          aria-label="Close side-by-side thread"
          title="Close side-by-side thread"
        >
          <XIcon className="size-4" />
        </Button>
        <ThreadChatView
          // A workflow child can arrive in the route before the sidebar/store
          // projection catches up. Render the known route target immediately;
          // the thread view fetches its own server state and the title updates
          // when the projection arrives.
          threadId={embeddedThreadId}
          projectId={view.projectId}
          projectTitle={threadProject?.title ?? view.projectId}
          {...(threadProject?.workspace?.rootPath
            ? { projectWorkspaceRoot: threadProject.workspace.rootPath }
            : {})}
          title={embeddedThread?.title ?? "Orchestration thread"}
          hideHeader
          embeddedMode
          {...(embeddedThread?.ticketId ? { ticketId: embeddedThread.ticketId } : {})}
          {...(embeddedThread?.ticketDisplayId
            ? { ticketDisplayId: embeddedThread.ticketDisplayId }
            : {})}
          {...(embeddedThread?.selectedToolIds !== undefined
            ? { selectedToolIds: embeddedThread.selectedToolIds }
            : {})}
        />
      </div>
    </div>
  );
}
