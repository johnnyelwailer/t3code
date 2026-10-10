import { ProjectMyWorkTicketExtra } from "~/t3team/t3team-ProjectMyWorkTicketExtra";
import {
  getGitHubActivityItemsForWorkItem,
  type GitHubWorkActivityItem,
} from "~/t3team/t3team-githubActivity";
import type { ProjectMyWorkVisibleHierarchy } from "~/t3team/t3team-projectMyWork";
import type { ProjectBacklogTableRow } from "~/t3team/t3team-projectBacklogTable";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function buildProjectMyWorkTableRows(input: {
  isHierarchyMode: boolean;
  visibleHierarchy: ProjectMyWorkVisibleHierarchy;
  filteredWorkItems: readonly ProjectTicket[];
}): ReadonlyArray<ProjectBacklogTableRow> {
  return input.isHierarchyMode
    ? input.visibleHierarchy.rows
    : input.filteredWorkItems.map((ticket) => ({ ticket, depth: 0, isContextOnly: false }));
}

export function renderProjectMyWorkTicketExtra(input: {
  ticket: ProjectTicket;
  compact?: boolean | undefined;
  githubActivityByWorkItem?: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
}) {
  const pullRequests = input.githubActivityByWorkItem
    ? getGitHubActivityItemsForWorkItem(input.githubActivityByWorkItem, input.ticket.ref.displayId)
    : [];
  return (
    <ProjectMyWorkTicketExtra
      ticket={input.ticket}
      pullRequests={pullRequests}
      {...(input.compact ? { compact: input.compact } : {})}
    />
  );
}
