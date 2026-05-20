import { TicketWorkItemCard } from "~/t3work/t3work-ProjectDashboardItemViews";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function ProjectDashboardChildrenCards({
  tickets,
  jiraLastCheckedAt,
  projectId,
  onOpenTicket,
}: {
  tickets: readonly ProjectTicket[];
  jiraLastCheckedAt?: number;
  projectId: string;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  if (tickets.length === 0) return null;

  return (
    <T3SurfacePanel tone="inset" className="mt-2 ml-2 rounded-md px-2 py-1.5">
      <div className="space-y-1.5 border-l-2 border-border/70 pl-2">
        {tickets.map((child) => (
          <TicketWorkItemCard
            key={child.id}
            ticket={child}
            compact
            flat
            child
            {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
            onOpen={() => onOpenTicket(projectId, child.id)}
          />
        ))}
      </div>
    </T3SurfacePanel>
  );
}
