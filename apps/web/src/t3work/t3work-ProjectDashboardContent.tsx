import { TicketWorkItemCard, TicketWorkItemRow } from "~/t3work/t3work-ProjectDashboardItemViews";
import { ProjectDashboardHierarchyContent } from "~/t3work/t3work-ProjectDashboardHierarchyContent";
import { GitHubActivityInlineList } from "~/t3work/t3work-GitHubActivityViews";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";

type TicketHierarchy = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
};

function renderChildrenCards(
  children: readonly ProjectTicket[],
  projectId: string,
  onOpenTicket: (projectId: string, ticketId: string) => void,
) {
  if (children.length === 0) return null;
  return (
    <T3SurfacePanel tone="inset" className="mt-2 ml-2 rounded-md px-2 py-1.5">
      <div className="space-y-1.5 border-l-2 border-border/70 pl-2">
        {children.map((child) => (
          <TicketWorkItemCard
            key={child.id}
            ticket={child}
            compact
            flat
            child
            onOpen={() => onOpenTicket(projectId, child.id)}
          />
        ))}
      </div>
    </T3SurfacePanel>
  );
}

export function ProjectDashboardContent({
  filteredWorkItems,
  viewMode,
  isHierarchyMode,
  kanbanColumns,
  parentChildGroups,
  githubActivityByWorkItem,
  projectId,
  onOpenTicket,
}: {
  filteredWorkItems: readonly ProjectTicket[];
  viewMode: "grid" | "list" | "kanban";
  isHierarchyMode: boolean;
  kanbanColumns: {
    todo: { title: string; items: ProjectTicket[] };
    inProgress: { title: string; items: ProjectTicket[] };
    review: { title: string; items: ProjectTicket[] };
    done: { title: string; items: ProjectTicket[] };
    other: { title: string; items: ProjectTicket[] };
  };
  parentChildGroups: TicketHierarchy;
  githubActivityByWorkItem: ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>>;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  if (filteredWorkItems.length === 0) {
    return (
      <T3SurfacePanel tone="dashed" className="px-4 py-8 text-sm text-muted-foreground">
        No tickets match your current search and filters.
      </T3SurfacePanel>
    );
  }

  if (viewMode === "kanban") {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {(
          [
            ["todo", kanbanColumns.todo],
            ["inProgress", kanbanColumns.inProgress],
            ["review", kanbanColumns.review],
            ["done", kanbanColumns.done],
            ["other", kanbanColumns.other],
          ] as const
        ).map(([key, column]) => (
          <T3SurfacePanel key={key} tone="soft" className="min-w-0 p-2">
            <div className="mb-2 flex items-center justify-between border-b border-border/70 pb-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {column.title}
              </h4>
              <span className="text-[11px] text-muted-foreground">{column.items.length}</span>
            </div>
            <div className="space-y-1.5">
              {(isHierarchyMode
                ? [
                    ...parentChildGroups.roots.filter((parent) =>
                      column.items.some((item) => item.id === parent.id),
                    ),
                    ...(key === "other" ? parentChildGroups.unresolvedChildren : []),
                  ]
                : column.items
              ).map((ticket) => {
                const children = parentChildGroups.childrenByParentId.get(ticket.id) ?? [];
                return (
                  <T3SurfacePanel
                    key={ticket.id}
                    tone="default"
                    className="rounded-md bg-background/90 px-2.5 py-2"
                  >
                    <TicketWorkItemCard
                      ticket={ticket}
                      compact
                      flat
                      {...(isHierarchyMode ? { childCount: children.length } : {})}
                      extraChildren={
                        <GitHubActivityInlineList
                          items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                          limit={3}
                        />
                      }
                      onOpen={() => onOpenTicket(projectId, ticket.id)}
                    />
                    {isHierarchyMode
                      ? renderChildrenCards(children, projectId, onOpenTicket)
                      : null}
                  </T3SurfacePanel>
                );
              })}
            </div>
          </T3SurfacePanel>
        ))}
      </div>
    );
  }

  if (isHierarchyMode) {
    return (
      <ProjectDashboardHierarchyContent
        viewMode={viewMode === "list" ? "list" : "grid"}
        parentChildGroups={parentChildGroups}
        projectId={projectId}
        onOpenTicket={onOpenTicket}
      />
    );
  }

  if (viewMode === "list") {
    return (
      <T3SurfacePanel tone="muted" className="divide-y divide-border/70">
        {filteredWorkItems.map((ticket) => (
          <div key={ticket.id} className="px-3 py-2.5 transition-colors hover:bg-accent/30">
            <TicketWorkItemRow
              ticket={ticket}
              extraChildren={
                <GitHubActivityInlineList
                  items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                  limit={2}
                />
              }
              onOpen={() => onOpenTicket(projectId, ticket.id)}
            />
          </div>
        ))}
      </T3SurfacePanel>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filteredWorkItems.map((ticket) => {
        return (
          <T3SurfacePanel key={ticket.id} tone="muted" className="px-2.5 py-2">
            <TicketWorkItemCard
              ticket={ticket}
              flat
              extraChildren={
                <GitHubActivityInlineList
                  items={githubActivityByWorkItem.get(ticket.ref.displayId) ?? []}
                  limit={3}
                />
              }
              onOpen={() => onOpenTicket(projectId, ticket.id)}
            />
          </T3SurfacePanel>
        );
      })}
    </div>
  );
}
