import type { ProjectShellProject } from "@t3tools/project-context";

import type { useWorkItemDetailViewModel } from "~/t3team/hooks/t3team-useWorkItemDetailViewModel";
import type { DigestTicketChatActions } from "~/t3team/t3team-digestTicketChatContext";
import { TicketDetailKickoffAside } from "~/t3team/t3team-TicketDetailKickoffAside";
import { buildTicketDetailKickoffAsideProps } from "~/t3team/t3team-TicketDetailViewProps";

/**
 * The ticket page's own agent panel, for a ticket shown beside My Work: quick starts scoped to this
 * ticket and a composer with the ticket attached, or the ticket's running thread once there is one.
 * Same props as the ticket page builds (`TicketDetailView`), from the same view model.
 */
export function DigestTicketAsideChat({
  project,
  view,
  actions,
}: {
  project: ProjectShellProject;
  view: ReturnType<typeof useWorkItemDetailViewModel>;
  actions: DigestTicketChatActions;
}) {
  return (
    <TicketDetailKickoffAside
      {...buildTicketDetailKickoffAsideProps({
        project,
        displayId: view.displayId,
        title: view.title,
        ticket: view.ticket,
        status: view.status,
        relationshipKeys: view.relationshipKeys,
        relatedTickets: view.relatedTickets,
        issueType: view.issueType,
        priority: view.priority,
        resolvedTicketId: view.ticket?.id ?? view.canonicalTicketId,
        activeThread: view.activeThread,
        matchedGitHubActivityItems: view.matchedGitHubActivityItems,
        backendState: view.backendState,
        onOpenThread: actions.onOpenThread,
        onOpenFullThread: actions.onOpenFullThread,
        onThreadKickoffConsumed: actions.onThreadKickoffConsumed,
        onKickoffThread: actions.onKickoffThread,
      })}
    />
  );
}
