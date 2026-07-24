import { ArrowDown, ArrowUp } from "lucide-react";

import { ProjectDashboardTicketGitHubActivity } from "~/t3team/t3team-ProjectDashboardTicketGitHubActivity";
import { ProjectBacklogTableRowIssueCell } from "~/t3team/t3team-ProjectBacklogTableRowIssueCell";
import {
  getGitHubActivityItemsForWorkItem,
  type GitHubWorkActivityItem,
} from "~/t3team/t3team-githubActivity";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import type {
  ProjectMyWorkTableSortBy,
  ProjectMyWorkTableSortDirection,
} from "~/t3team/t3team-projectDashboardMyWorkState";
import type { ProjectBacklogTableRow } from "~/t3team/t3team-projectBacklogTable";
import { renderRelativeUpdatedAt } from "~/t3team/t3team-githubActivityViewUtils";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectMyWorkTableView({
  projectId,
  rows,
  showGitHubActivity,
  sortBy,
  sortDirection,
  githubActivityByWorkItem,
  githubLastCheckedAt,
  onSortByChange,
  onSortDirectionChange,
  onGitHubActivityContextMenu,
  onTicketContextMenu,
  onOpenTicket,
  getGitHubActivityDragCapabilities,
}: {
  projectId: string;
  rows: ReadonlyArray<ProjectBacklogTableRow>;
  showGitHubActivity: boolean;
  sortBy: ProjectMyWorkTableSortBy;
  sortDirection: ProjectMyWorkTableSortDirection;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  githubLastCheckedAt?: number;
  onSortByChange: (value: ProjectMyWorkTableSortBy) => void;
  onSortDirectionChange: (value: ProjectMyWorkTableSortDirection) => void;
  onGitHubActivityContextMenu: (
    event: React.MouseEvent,
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => void;
  onTicketContextMenu: (event: React.MouseEvent, ticket: ProjectTicket) => void;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  getGitHubActivityDragCapabilities?: (
    ticket: ProjectTicket,
    item: GitHubWorkActivityItem,
  ) => AgentContextCapabilities;
}) {
  function renderSortButton(label: string, column: ProjectMyWorkTableSortBy) {
    const active = sortBy === column;

    return (
      <button
        type="button"
        className="inline-flex w-full items-center gap-1 font-semibold hover:text-foreground"
        onClick={() => {
          if (active) {
            onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc");
            return;
          }
          onSortByChange(column);
        }}
      >
        <span>{label}</span>
        {active ? (
          sortDirection === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 overflow-x-auto overflow-y-visible rounded-xl border border-border/70 bg-background/95 shadow-sm [scrollbar-gutter:stable]">
        <table className="w-full table-fixed text-left text-[11px]" style={{ minWidth: "1150px" }}>
          <colgroup>
            <col style={{ width: "420px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "160px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "300px" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-background/95 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/72 backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <tr>
              <th className="px-3 py-1.5">{renderSortButton("Issue", "title")}</th>
              <th className="px-3 py-1.5">{renderSortButton("Status", "status")}</th>
              <th className="px-3 py-1.5">{renderSortButton("Owner", "assignee")}</th>
              <th className="px-3 py-1.5">{renderSortButton("Updated", "updated")}</th>
              <th className="px-3 py-1.5 font-semibold text-foreground/80">GitHub</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 align-top">
            {rows.map((row) => {
              const ticket = row.ticket;
              const updatedLabel = renderRelativeUpdatedAt(ticket.updatedAt);
              const activityItems = getGitHubActivityItemsForWorkItem(
                githubActivityByWorkItem,
                ticket.ref.displayId,
              );

              return (
                <tr
                  key={`${ticket.id}:${row.depth}:${row.isContextOnly ? "context" : "direct"}`}
                  className={
                    row.isContextOnly
                      ? "group bg-muted/10 text-muted-foreground hover:bg-muted/18"
                      : "group hover:bg-muted/18"
                  }
                >
                  <ProjectBacklogTableRowIssueCell
                    row={row}
                    projectId={projectId}
                    ticketCollapsed={false}
                    canToggleChildren={false}
                    onContextMenu={(event) => onTicketContextMenu(event, ticket)}
                    onToggleTicket={() => {}}
                    onOpenTicket={onOpenTicket}
                  />
                  <td className="px-3 py-2 align-middle text-[11px] text-foreground/82">
                    {ticket.status}
                  </td>
                  <td className="px-3 py-2 align-middle text-[11px] text-foreground/82">
                    {ticket.assignee?.trim() || "Unassigned"}
                  </td>
                  <td
                    className="px-3 py-2 align-middle text-[11px] text-foreground/82"
                    title={ticket.updatedAt}
                  >
                    {updatedLabel ? `Updated ${updatedLabel}` : "Unknown"}
                  </td>
                  <td className="px-3 py-2 align-top text-[11px]">
                    {showGitHubActivity ? (
                      activityItems.length > 0 ? (
                        <ProjectDashboardTicketGitHubActivity
                          items={activityItems}
                          enabled
                          limit={2}
                          compact
                          {...(githubLastCheckedAt !== undefined
                            ? { lastCheckedAt: githubLastCheckedAt }
                            : {})}
                          onItemContextMenu={(event, item) =>
                            onGitHubActivityContextMenu(event, ticket, item)
                          }
                          {...(getGitHubActivityDragCapabilities
                            ? {
                                getItemDragCapabilities: (item: GitHubWorkActivityItem) =>
                                  getGitHubActivityDragCapabilities(ticket, item),
                              }
                            : {})}
                        />
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">Hidden</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
