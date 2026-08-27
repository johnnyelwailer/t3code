import { useCallback, useEffect } from "react";
import { PanelRightOpenIcon } from "lucide-react";
import { useCanGoBack } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ProjectShellProject } from "@t3tools/project-context";
import { ThreadId } from "@t3tools/contracts";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useRightPanelStore } from "~/rightPanelStore";
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
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenEmbeddedThread: (projectId: string, threadId: string) => void;
  onCloseEmbeddedThread: () => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onRememberFullThread: (threadId: string) => void;
  onBackToDashboard: (projectId: string) => void;
}) {
  const canGoBack = useCanGoBack();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
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

  // Legacy migration: routes written while side chat was the `?chatThreadId` split pane still
  // carry the peer in the URL. The split pane is retired — the peer is now a side-chat tab in
  // this thread's right panel — so adopt it there and strip the search param (replace, so the
  // old URL does not linger in history). A thread is never its own side chat.
  const embeddedThreadId = view.embeddedThreadId;
  useEffect(() => {
    if (!embeddedThreadId || embeddedThreadId === view.threadId) {
      return;
    }
    if (primaryEnvironmentId) {
      useRightPanelStore
        .getState()
        .openThreadSurface(
          scopeThreadRef(primaryEnvironmentId, ThreadId.make(view.threadId)),
          embeddedThreadId,
        );
    }
    onCloseEmbeddedThread();
  }, [embeddedThreadId, onCloseEmbeddedThread, primaryEnvironmentId, view.threadId]);

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

  return parentChat;
}
