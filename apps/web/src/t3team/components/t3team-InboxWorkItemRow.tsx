/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * One work-item row in the Work lens, carrying the same actions its Code-lens twin has.
 *
 * The Code lens reaches these through `ProjectSidebarPinnedItems`; a distribution that ships
 * `sidebarLens: "work"` never mounts that component, so pinning was one-way there — an item could
 * be pinned from the Backlog/My work views but not unpinned, reordered, hidden or dragged from the
 * sidebar it was pinned INTO. This row closes that: same `useTicketAgentContext` menu, same
 * `useProjectSidebarNavItemDnd` drag/drop, so both lenses drive one store and one set of prefs.
 *
 * Per-row rather than per-project section, deliberately: the Inbox is one flat activity-ordered
 * stream that interleaves work items with threads, and grouping by project to hoist the hook out
 * would reorder the stream. Pinned/assigned rows are a short list, so a hook instance per row is
 * the cheaper trade.
 */
import { GitPullRequestIcon, EllipsisIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { ProjectShellProject } from "@t3tools/project-context";

import { T3TeamAgentContextDropOverlay } from "~/t3team/t3team-agentContextDrag";
import { useTicketAgentContext } from "~/t3team/hooks/t3team-useTicketAgentContext";
import type { InboxWorkItemRow as InboxWorkItemRowData } from "~/t3team/t3team-inboxWorkItems";
import { buildTicketSidebarPinnedItemId } from "~/t3team/t3team-sidebarPinningTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";

import { useProjectSidebarNavItemDnd } from "./t3team-useProjectSidebarNavItemDnd";

export function InboxWorkItemRow({
  row,
  project,
  projectTickets,
  scopeItemIds,
}: {
  row: InboxWorkItemRowData;
  project: ProjectShellProject;
  projectTickets: ReadonlyArray<ProjectTicket>;
  /** Sibling pinned item ids, so a drop reorders within the same scope the Code lens uses. */
  scopeItemIds: ReadonlyArray<string>;
}) {
  const navigate = useNavigate();
  const { getTicketAgentContext, openTicketAgentContextMenu, openTicketAgentContextMenuAt } =
    useTicketAgentContext({ project, projectTickets });

  const ticket = projectTickets.find((candidate) => candidate.id === row.ticketId);
  // `getTicketAgentContext` already returns null without a backend; a missing ticket means the
  // row outlived its Jira item, which stays visible but inert rather than disappearing.
  const capabilities = ticket ? getTicketAgentContext(ticket, { visibleInSidebar: true }) : null;
  const sidebarItemId = buildTicketSidebarPinnedItemId({
    projectId: row.projectId,
    ticketId: row.ticketId,
  });

  const { dragProps, dropProps, isDropActive } = useProjectSidebarNavItemDnd({
    projectId: row.projectId,
    itemId: sidebarItemId,
    label: `${row.displayId} ${row.title}`,
    capabilities,
    scopeItemIds,
  });

  const openTicket = () =>
    void navigate({
      to: "/t3team/projects/$projectId/tickets/$ticketId",
      params: { projectId: row.projectId, ticketId: row.ticketId },
    });

  return (
    <li
      data-t3team-inbox-work-item
      // Upstream clears the thread selection on any mousedown outside a selection-safe element.
      // Without this, opening this row's actions menu would drop the selection behind it.
      data-thread-selection-safe
      className="group/inbox-work-item relative list-none py-0.5"
      onContextMenu={(event) => {
        if (!ticket) return;
        openTicketAgentContextMenu(event, ticket, { visibleInSidebar: true });
      }}
      {...dropProps}
      draggable={dragProps.draggable}
      onDragStart={dragProps.onDragStart}
      onDragEnd={dragProps.onDragEnd}
    >
      <T3TeamAgentContextDropOverlay
        active={isDropActive}
        label="Drop to move this work item"
        className="rounded-md"
      />
      <button
        type="button"
        onClick={openTicket}
        title={row.title || row.displayId}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md border-l-2 border-sidebar-border px-2.5 py-1.5 pr-7 text-left hover:bg-sidebar-row-hover"
      >
        <span className="shrink-0 text-xs font-medium text-sidebar-muted-foreground">
          {row.displayId}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground">{row.title}</span>
        {row.pullRequestCount > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-sidebar-muted-foreground">
            <GitPullRequestIcon className="size-3" />
            {row.pullRequestCount}
          </span>
        ) : null}
      </button>
      {ticket ? (
        <button
          type="button"
          aria-label={`Issue actions for ${row.displayId}`}
          className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring group-hover/inbox-work-item:opacity-100 group-focus-within/inbox-work-item:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            openTicketAgentContextMenuAt(
              ticket,
              Math.round(rect.left + rect.width / 2),
              Math.round(rect.bottom),
              { visibleInSidebar: true },
            );
          }}
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      ) : null}
    </li>
  );
}
