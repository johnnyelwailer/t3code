import { TicketWorkItemCard, TicketWorkItemRow } from "~/t3work/t3work-ProjectDashboardItemViews";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import type { ProjectTicket } from "~/t3work/t3work-types";

type TicketHierarchy = {
  roots: readonly ProjectTicket[];
  unresolvedChildren: readonly ProjectTicket[];
  childrenByParentId: ReadonlyMap<string, readonly ProjectTicket[]>;
};

export function ProjectDashboardHierarchyContent({
  viewMode,
  parentChildGroups,
  projectId,
  onOpenTicket,
}: {
  viewMode: "grid" | "list";
  parentChildGroups: TicketHierarchy;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  if (viewMode === "list") {
    return (
      <div className="space-y-3">
        {parentChildGroups.roots.map((parent) => {
          const children = parentChildGroups.childrenByParentId.get(parent.id) ?? [];
          return (
            <T3SurfacePanel key={parent.id} tone="muted" className="px-3 py-2.5">
              <TicketWorkItemRow
                ticket={parent}
                childCount={children.length}
                onOpen={() => onOpenTicket(projectId, parent.id)}
              />
              {children.length > 0 ? (
                <T3SurfacePanel tone="inset" className="mt-2 ml-3 rounded-md px-2 py-1.5">
                  <div className="space-y-1.5 border-l-2 border-border/70 pl-2">
                    {children.map((child) => (
                      <TicketWorkItemRow
                        key={child.id}
                        ticket={child}
                        child
                        onOpen={() => onOpenTicket(projectId, child.id)}
                      />
                    ))}
                  </div>
                </T3SurfacePanel>
              ) : null}
            </T3SurfacePanel>
          );
        })}

        {parentChildGroups.unresolvedChildren.length > 0 ? (
          <T3SurfacePanel tone="dashed" className="px-3 py-2.5">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Unlinked subtasks</div>
            <div className="space-y-1.5">
              {parentChildGroups.unresolvedChildren.map((child) => (
                <TicketWorkItemRow
                  key={child.id}
                  ticket={child}
                  child
                  onOpen={() => onOpenTicket(projectId, child.id)}
                />
              ))}
            </div>
          </T3SurfacePanel>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[...parentChildGroups.roots, ...parentChildGroups.unresolvedChildren].map((ticket) => {
        const children = parentChildGroups.childrenByParentId.get(ticket.id) ?? [];
        return (
          <T3SurfacePanel key={ticket.id} tone="muted" className="px-2.5 py-2">
            <TicketWorkItemCard
              ticket={ticket}
              flat
              childCount={children.length}
              onOpen={() => onOpenTicket(projectId, ticket.id)}
            />
            {children.length > 0 ? (
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
            ) : null}
          </T3SurfacePanel>
        );
      })}
    </div>
  );
}
