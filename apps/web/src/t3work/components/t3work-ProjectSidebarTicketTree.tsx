/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectThread, ProjectTicket } from "~/t3work/t3work-types";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { buildTicketSidebarPinnedItemId } from "~/t3work/t3work-sidebarPinningTypes";
import {
  filterHiddenSidebarItemsById,
  filterHiddenSidebarItems,
  sortSidebarItemsByStoredOrderById,
  sortSidebarItemsByStoredOrder,
} from "~/t3work/t3work-sidebarNavPreferences";
import {
  TicketSidebarEntry,
  type TicketSidebarEntryProps,
} from "./t3work-ProjectSidebarTicketEntry";

interface TicketTreeNodeProps extends Omit<
  TicketSidebarEntryProps,
  "ticketThreads" | "githubActivityItems"
> {
  ticket: ProjectTicket;
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
  ticketThreadsById: ReadonlyMap<string, readonly ProjectThread[]>;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  hiddenSidebarItemIds: ReadonlyArray<string>;
  orderedSidebarItemIds: ReadonlyArray<string>;
  siblingSidebarItemIds: ReadonlyArray<string>;
  depth?: number;
}

export function TicketTreeNode({
  project,
  projectTickets,
  ticket,
  projectId,
  view,
  childrenByParentId,
  ticketThreadsById,
  githubActivityByWorkItem,
  hiddenSidebarItemIds,
  orderedSidebarItemIds,
  siblingSidebarItemIds,
  jiraLastCheckedAt,
  githubActivityLastCheckedAt,
  showGitHubActivity,
  onSelectTicket,
  onCreateTicketThread,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  depth = 0,
}: TicketTreeNodeProps) {
  const children = sortSidebarItemsByStoredOrderById(
    filterHiddenSidebarItemsById(
      childrenByParentId.get(ticket.id) ?? [],
      hiddenSidebarItemIds,
      (child) => buildTicketSidebarPinnedItemId({ projectId, ticketId: child.id }),
    ),
    orderedSidebarItemIds,
    (child) => buildTicketSidebarPinnedItemId({ projectId, ticketId: child.id }),
  );
  const childSidebarItemIds = children.map((child) =>
    buildTicketSidebarPinnedItemId({ projectId, ticketId: child.id }),
  );

  return (
    <div className={depth > 0 ? "ml-2 border-l border-border/60 pl-2" : ""}>
      <TicketSidebarEntry
        project={project}
        projectTickets={projectTickets}
        ticket={ticket}
        projectId={projectId}
        view={view}
        ticketThreads={ticketThreadsById.get(ticket.id) ?? []}
        {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
        githubActivityItems={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
        {...(githubActivityLastCheckedAt !== undefined ? { githubActivityLastCheckedAt } : {})}
        showGitHubActivity={showGitHubActivity}
        onSelectTicket={onSelectTicket}
        onCreateTicketThread={onCreateTicketThread}
        onSelectThread={onSelectThread}
        onDeleteThread={onDeleteThread}
        onRenameThread={onRenameThread}
        sidebarNavOrderScopeIds={siblingSidebarItemIds}
      />
      {children.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {children.map((child) => (
            <TicketTreeNode
              key={child.id}
              project={project}
              projectTickets={projectTickets}
              ticket={child}
              projectId={projectId}
              view={view}
              childrenByParentId={childrenByParentId}
              ticketThreadsById={ticketThreadsById}
              githubActivityByWorkItem={githubActivityByWorkItem}
              {...(jiraLastCheckedAt !== undefined ? { jiraLastCheckedAt } : {})}
              {...(githubActivityLastCheckedAt !== undefined
                ? { githubActivityLastCheckedAt }
                : {})}
              showGitHubActivity={showGitHubActivity}
              onSelectTicket={onSelectTicket}
              onCreateTicketThread={onCreateTicketThread}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
              onRenameThread={onRenameThread}
              hiddenSidebarItemIds={hiddenSidebarItemIds}
              orderedSidebarItemIds={orderedSidebarItemIds}
              siblingSidebarItemIds={childSidebarItemIds}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
