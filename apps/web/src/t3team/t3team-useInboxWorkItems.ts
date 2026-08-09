import { useMemo } from "react";

import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { useT3TeamPinnedSidebarStore } from "~/t3team/t3team-pinnedSidebarStore";
import { useT3TeamSidebarNavPreferencesStore } from "~/t3team/t3team-sidebarNavPreferencesStore";
import {
  resolveInboxAttribution,
  selectInboxWorkItems,
  type InboxWorkItemAttribution,
  type InboxWorkItemRow,
} from "~/t3team/t3team-inboxWorkItems";
import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * React bindings for the Inbox Team context. All selection and ordering lives in
 * the pure `t3team-inboxWorkItems` module; these hooks only gather the inputs.
 */

function useTeamTickets(): ReadonlyArray<ProjectTicket> {
  const { allProjects, getTicketsForProject } = useProjectStore();
  return useMemo(
    () => allProjects.flatMap((project) => getTicketsForProject(project.id)),
    [allProjects, getTicketsForProject],
  );
}

function useTicketsById(): ReadonlyMap<string, ProjectTicket> {
  const tickets = useTeamTickets();
  return useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets]);
}

export function useT3TeamInboxAttribution(threadId: string): InboxWorkItemAttribution | null {
  const { threads } = useProjectStore();
  const ticketsById = useTicketsById();

  return useMemo(() => {
    const thread = threads.find((candidate) => candidate.id === threadId);
    return thread ? resolveInboxAttribution({ thread, ticketsById }) : null;
  }, [threadId, threads, ticketsById]);
}

export function useT3TeamInboxWorkItems(): ReadonlyArray<InboxWorkItemRow> {
  const { threads } = useProjectStore();
  const tickets = useTeamTickets();
  const pinnedItems = useT3TeamPinnedSidebarStore((state) => state.items);

  const preferencesByProjectId = useT3TeamSidebarNavPreferencesStore(
    (state) => state.preferencesByProjectId,
  );

  const pinnedTicketIds = useMemo(
    () =>
      new Set(
        pinnedItems.flatMap((item) => (item.kind === "jira-work-item" ? [item.ticketId] : [])),
      ),
    [pinnedItems],
  );

  // Flattened across projects. The Code lens scopes these per project because its rows live under
  // per-project headings; this stream has one flat list, and project-scoped item ids keep the
  // union unambiguous. Projects are visited in sorted id order so the arrangement is stable across
  // reloads rather than following whatever order the settings blob happened to serialize in.
  const { hiddenSidebarItemIds, orderedSidebarItemIds } = useMemo(() => {
    const projectIds = Object.keys(preferencesByProjectId).sort();
    return {
      hiddenSidebarItemIds: projectIds.flatMap(
        (projectId) => preferencesByProjectId[projectId]?.hiddenItemIds ?? [],
      ),
      orderedSidebarItemIds: projectIds.flatMap(
        (projectId) => preferencesByProjectId[projectId]?.orderedItemIds ?? [],
      ),
    };
  }, [preferencesByProjectId]);

  return useMemo(
    () =>
      selectInboxWorkItems({
        tickets,
        threads,
        pinnedTicketIds,
        hiddenSidebarItemIds,
        orderedSidebarItemIds,
        // Assignment-based rows need the viewer's Atlassian account id, which the
        // shell does not expose yet; pinned rows work today and assigned rows light
        // up as soon as that identity lands (doc 40, phase 1).
        viewerAccountId: null,
        // Native PR detail is deferred (doc 40); until the association is read here
        // the aggregate count stays at zero rather than guessing.
        threadHasPullRequest: () => false,
      }),
    [hiddenSidebarItemIds, orderedSidebarItemIds, pinnedTicketIds, threads, tickets],
  );
}
