import { useCallback, useEffect } from "react";
import { PanelRightOpenIcon, XIcon } from "lucide-react";
import { useCanGoBack } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ThreadChatView } from "~/t3team/chat/t3team-ThreadChatView";
import { Button } from "~/t3team/components/ui/t3team-button";
import type { ProjectThread, ViewState } from "~/t3team/t3team-types";
import { navigateBackWithFallback } from "~/t3team/t3team-historyBack";
import { useFinalizePromotedDraft } from "~/t3team/t3team-useFinalizePromotedDraft";
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
  // Upstream retires the draft behind a promoted thread on its own thread
  // route; the Team shell owns this route instead, so it has to do it here.
  useFinalizePromotedDraft(view.threadId);

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
      {...(threadProject?.source ? { projectSource: threadProject.source } : {})}
      {...(threadProject?.workspace?.rootPath
        ? { projectWorkspaceRoot: threadProject.workspace.rootPath }
        : {})}
      title={resolvedThread?.title ?? "New thread"}
      {...(resolvedThread?.kickoffMessage !== undefined
        ? { kickoffMessage: resolvedThread.kickoffMessage }
        : {})}
      {...(resolvedThread?.kickoffPending !== undefined
        ? { kickoffPending: resolvedThread.kickoffPending }
        : {})}
      {...(resolvedThread?.kickoffWorkflow
        ? { kickoffWorkflow: resolvedThread.kickoffWorkflow }
        : {})}
      {...(resolvedThread?.kickoffPending && resolvedThread.kickoffMessage !== undefined
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
  // A thread is never its own side-by-side companion. Rendering it twice gives one conversation two
  // timelines and two composers, and a suspended `askUser` two places to answer it — answering in one
  // leaves the other stale and it is ambiguous which is real. The navigation helper refuses to
  // produce this route; this is the invariant that holds regardless of how the route was reached.
  if (!embeddedThreadId || embeddedThreadId === view.threadId) {
    return parentChat;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 divide-x divide-border overflow-hidden">
      <div className="flex min-w-0 flex-1">{parentChat}</div>
      <div className="t3team-embedded-thread-pane relative flex min-w-0 flex-1">
        <Button
          size="icon-xs"
          variant="ghost"
          className="t3team-embedded-thread-close absolute z-10 shrink-0 text-muted-foreground/80"
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
          {...(threadProject?.source ? { projectSource: threadProject.source } : {})}
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
