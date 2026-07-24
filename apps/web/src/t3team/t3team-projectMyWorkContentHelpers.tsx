import type { ComponentProps } from "react";

import { ProjectMyWorkTicketExtra } from "~/t3team/t3team-ProjectMyWorkTicketExtra";
import type { ProjectMyWorkVisibleHierarchy } from "~/t3team/t3team-projectMyWork";
import type { ProjectBacklogTableRow } from "~/t3team/t3team-projectBacklogTable";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import type { ProjectTicket } from "~/t3team/t3team-types";

type GitHubActivityContextMenu = ComponentProps<
  typeof ProjectMyWorkTicketExtra
>["onGitHubActivityContextMenu"];
type GitHubActivityDragCapabilities = NonNullable<
  ComponentProps<typeof ProjectMyWorkTicketExtra>["getGitHubActivityDragCapabilities"]
>;

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
  showGitHubActivity: boolean;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  githubLastCheckedAt?: number | undefined;
  onGitHubActivityContextMenu: GitHubActivityContextMenu;
  getGitHubActivityDragCapabilities: GitHubActivityDragCapabilities;
}) {
  return (
    <ProjectMyWorkTicketExtra
      ticket={input.ticket}
      showGitHubActivity={input.showGitHubActivity}
      githubActivityByWorkItem={input.githubActivityByWorkItem}
      {...(input.githubLastCheckedAt !== undefined
        ? { githubLastCheckedAt: input.githubLastCheckedAt }
        : {})}
      {...(input.compact ? { compact: input.compact } : {})}
      onGitHubActivityContextMenu={input.onGitHubActivityContextMenu}
      getGitHubActivityDragCapabilities={(workItem, item) =>
        input.getGitHubActivityDragCapabilities(workItem, item)
      }
    />
  );
}
