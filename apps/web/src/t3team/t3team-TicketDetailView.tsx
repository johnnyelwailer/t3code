import { useCallback } from "react";
import { useCanGoBack } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useAgentContext } from "~/t3team/hooks/t3team-useAgentContext";
import { useWorkItemDetailViewModel } from "~/t3team/hooks/t3team-useWorkItemDetailViewModel";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import { TicketDetailBody } from "~/t3team/t3team-TicketDetailBody";
import { buildTicketDetailKickoffAsideProps } from "~/t3team/t3team-TicketDetailViewProps";
import { navigateBackWithFallback } from "~/t3team/t3team-historyBack";
import type { ProjectThread } from "~/t3team/t3team-types";
import { WorkItemDetailHeader } from "~/t3team/workitem/t3team-WorkItemDetailHeader";
import { WorkItemAgentRewriteControl } from "~/t3team/workitem/t3team-WorkItemAgentRewriteControl";
import { useWorkItemDrafts } from "~/t3team/workitem/t3team-useWorkItemDrafts";
import { buildWorkItemDetailMainProps } from "~/t3team/workitem/t3team-buildWorkItemDetailMainProps";
import { WorkItemDetailMain } from "~/t3team/workitem/t3team-WorkItemDetailMain";

/**
 * The work item detail route.
 *
 * Data resolution lives in `useWorkItemDetailViewModel`; this component is composition only —
 * chrome, the content column, and the agent panel beside it.
 */
export function TicketDetailView({
  project,
  ticketId,
  shouldInsetDesktopHeader = false,
  activeThreadId,
  projectThreads,
  onOpenTicket,
  onOpenThread,
  onOpenFullThread,
  onKickoffThread,
  onThreadKickoffConsumed,
  onRememberEmbeddedThread,
  onBack,
}: {
  project: ProjectShellProject;
  ticketId: string;
  shouldInsetDesktopHeader?: boolean;
  activeThreadId?: string;
  projectThreads: ProjectThread[];
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onOpenThread: (projectId: string, threadId: string) => void;
  onOpenFullThread: (projectId: string, threadId: string) => void;
  onKickoffThread: (input: TicketKickoffThreadInput) => void;
  onThreadKickoffConsumed: (threadId: string) => void;
  onRememberEmbeddedThread: (threadId: string) => void;
  onBack: () => void;
}) {
  const canGoBack = useCanGoBack();
  const { showAgentContextMenu } = useAgentContext();
  const view = useWorkItemDetailViewModel({
    project,
    ticketId,
    ...(activeThreadId !== undefined ? { activeThreadId } : {}),
    projectThreads,
    onRememberEmbeddedThread,
  });

  const handleBack = useCallback(() => {
    navigateBackWithFallback({ canGoBack, onFallback: onBack });
  }, [canGoBack, onBack]);

  const handleOpenTicket = useCallback(
    (nextTicketId: string) => onOpenTicket(project.id, nextTicketId),
    [onOpenTicket, project.id],
  );

  // Same resolution `buildTicketDetailKickoffAsideProps` below uses for its own `resolvedTicketId` —
  // kept in sync rather than recomputed differently, since both target the same ticket.
  const resolvedTicketId = view.ticket?.id ?? view.canonicalTicketId;
  const descriptionDrafts = useWorkItemDrafts({ issueIdOrKey: view.fieldModel.key });
  // `view.title` falls back to the literal string "Ticket" once nothing has loaded — real ticket/
  // snapshot data or nothing, never that fallback, so the prompt never claims a title it doesn't have.
  const realTicketTitle = view.ticket?.ref.title ?? view.snapshot?.ref.title;
  const descriptionAction = (
    <WorkItemAgentRewriteControl
      backend={view.backend}
      projectId={project.id}
      ticketId={resolvedTicketId}
      issueIdOrKey={view.fieldModel.key}
      ticketDisplayId={view.displayId}
      {...(view.fieldModel.descriptionText
        ? { descriptionText: view.fieldModel.descriptionText }
        : {})}
      {...(realTicketTitle ? { summary: realTicketTitle } : {})}
      githubActivityItems={view.matchedGitHubActivityItems}
      {...(view.activeThread ? { activeThreadId: view.activeThread.id } : {})}
      onKickoffThread={onKickoffThread}
      hasPendingDescriptionDraft={descriptionDrafts.description !== undefined}
      hasLoadedWorkItem={Boolean(view.ticket) || Boolean(view.snapshot)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <WorkItemDetailHeader
        breadcrumb={{
          projectTitle: project.title,
          itemKey: view.displayId,
          ...(view.fieldModel.parent ? { parent: view.fieldModel.parent } : {}),
          onOpenParent: handleOpenTicket,
        }}
        {...(view.ticketUrl ? { externalUrl: view.ticketUrl } : {})}
        isRefreshing={view.loading}
        shouldInsetDesktopHeader={shouldInsetDesktopHeader}
        onBack={handleBack}
        onRefresh={() => void view.reload()}
      />

      <TicketDetailBody
        projectId={project.id}
        ticketId={ticketId}
        activeThreadId={activeThreadId}
        main={
          <WorkItemDetailMain
            {...buildWorkItemDetailMainProps({
              view,
              project,
              onOpenTicket: handleOpenTicket,
              showAgentContextMenu,
              descriptionAction,
            })}
          />
        }
        kickoffAsideProps={buildTicketDetailKickoffAsideProps({
          project,
          displayId: view.displayId,
          title: view.title,
          ticket: view.ticket,
          status: view.status,
          relationshipKeys: view.relationshipKeys,
          relatedTickets: view.relatedTickets,
          issueType: view.issueType,
          priority: view.priority,
          issueThreads: view.issueThreads,
          resolvedTicketId,
          activeThread: view.activeThread,
          matchedGitHubActivityItems: view.matchedGitHubActivityItems,
          backendState: view.backendState,
          onOpenThread,
          onOpenFullThread,
          onThreadKickoffConsumed,
          onKickoffThread,
        })}
      />
    </div>
  );
}
