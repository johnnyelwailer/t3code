import { useMemo } from "react";

import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { useT3TeamPinnedSidebarStore } from "~/t3team/t3team-pinnedSidebarStore";
import { useT3TeamSidebarNavPreferencesStore } from "~/t3team/t3team-sidebarNavPreferencesStore";
import {
  resolveInboxAttribution,
  selectInboxPinnedGitHubActivity,
  selectInboxWorkItems,
  type InboxGitHubActivityPinRow,
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

/**
 * Sidebar-nav preferences ("hide from sidebar" / "show at top"), flattened across projects.
 * The Code lens scopes these per project because its rows live under per-project headings; the
 * Inbox stream is flat (both the jira and the GitHub-activity rows within it), and project-scoped
 * item ids keep the union unambiguous. Projects are visited in sorted id order so the arrangement
 * is stable across reloads rather than following whatever order the settings blob happened to
 * serialize in.
 */
function useFlattenedSidebarNavPreferences(): {
  hiddenSidebarItemIds: ReadonlyArray<string>;
  orderedSidebarItemIds: ReadonlyArray<string>;
} {
  const preferencesByProjectId = useT3TeamSidebarNavPreferencesStore(
    (state) => state.preferencesByProjectId,
  );

  return useMemo(() => {
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
}

export function useT3TeamInboxWorkItems(): ReadonlyArray<InboxWorkItemRow> {
  const { threads } = useProjectStore();
  const tickets = useTeamTickets();
  const pinnedItems = useT3TeamPinnedSidebarStore((state) => state.items);
  const { hiddenSidebarItemIds, orderedSidebarItemIds } = useFlattenedSidebarNavPreferences();

  const pinnedTicketIds = useMemo(
    () =>
      new Set(
        pinnedItems.flatMap((item) => (item.kind === "jira-work-item" ? [item.ticketId] : [])),
      ),
    [pinnedItems],
  );

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

/**
 * Pinned `github-activity` items for the Work-lens Inbox (doc 40 follow-up). The Code lens reaches
 * these through `ProjectSidebarPinnedItems`; a `sidebarLens: "work"` distribution never mounts
 * that tree, so a GitHub item pinned via "Pin to left" had nowhere to render — the pin wrote to
 * the store fine, but this Inbox only ever read `jira-work-item` pins. This returns the raw pinned
 * refs (id/project/activity), already filtered and ordered by the same nav preferences the jira
 * rows honour; `t3team-InboxPinnedGitHubActivityRows.tsx` resolves each one against its project's
 * live activity feed.
 */
export function useT3TeamInboxPinnedGitHubActivity(): ReadonlyArray<InboxGitHubActivityPinRow> {
  const pinnedItems = useT3TeamPinnedSidebarStore((state) => state.items);
  const { hiddenSidebarItemIds, orderedSidebarItemIds } = useFlattenedSidebarNavPreferences();

  return useMemo(
    () =>
      selectInboxPinnedGitHubActivity({
        pinnedItems,
        hiddenSidebarItemIds,
        orderedSidebarItemIds,
      }),
    [hiddenSidebarItemIds, orderedSidebarItemIds, pinnedItems],
  );
}
