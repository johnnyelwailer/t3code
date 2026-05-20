import { GitBranch, Link2 } from "lucide-react";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3work/components/ui/t3work-surface";
import { TicketWorkItemCard, TicketWorkItemRow } from "~/t3work/t3work-ProjectDashboardItemViews";
import {
  buildTicketRelationships,
  toRelationshipTicket,
  type RelationshipEntry,
} from "~/t3work/t3work-ticketRelationships-helpers";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function TicketParentSummary({
  projectId,
  lastCheckedAt,
  onOpenTicket,
  parentEntry,
}: {
  projectId: string;
  lastCheckedAt?: number;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  parentEntry: RelationshipEntry | undefined;
}) {
  return (
    <T3SurfaceCard tone="muted">
      <T3SurfaceCardContent className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Parent
        </h3>

        {parentEntry ? (
          <TicketWorkItemCard
            ticket={toRelationshipTicket(parentEntry, projectId)}
            flat
            {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
            onOpen={() => onOpenTicket(projectId, parentEntry.ticket?.id ?? parentEntry.key)}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border/80 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            No parent linked.
          </div>
        )}
      </T3SurfaceCardContent>
    </T3SurfaceCard>
  );
}

export function TicketRelatedLinks({
  projectId,
  lastCheckedAt,
  onOpenTicket,
  childEntries,
  referencedEntries,
  onChildContextMenu,
  onReferenceContextMenu,
}: {
  projectId: string;
  lastCheckedAt?: number;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  childEntries: RelationshipEntry[];
  referencedEntries: RelationshipEntry[];
  onChildContextMenu?: (event: React.MouseEvent, entry: RelationshipEntry) => void;
  onReferenceContextMenu?: (event: React.MouseEvent, entry: RelationshipEntry) => void;
}) {
  return (
    <div className="space-y-4">
      <T3SurfaceCard>
        <T3SurfaceCardContent className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <GitBranch className="size-3.5" /> Children
          </div>
          {childEntries.length > 0 ? (
            <div className="space-y-1.5">
              {childEntries.slice(0, 12).map((entry) => (
                <TicketWorkItemRow
                  key={`child-${entry.key}`}
                  ticket={toRelationshipTicket(entry, projectId)}
                  {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
                  onOpen={() => onOpenTicket(projectId, entry.ticket?.id ?? entry.key)}
                  {...(onChildContextMenu
                    ? {
                        onContextMenu: (event: React.MouseEvent) =>
                          onChildContextMenu(event, entry),
                      }
                    : {})}
                />
              ))}
            </div>
          ) : (
            <div className="px-2 py-1 text-xs text-muted-foreground">No child items found.</div>
          )}
        </T3SurfaceCardContent>
      </T3SurfaceCard>

      <T3SurfaceCard>
        <T3SurfaceCardContent className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Link2 className="size-3.5" /> References
          </div>
          {referencedEntries.length > 0 ? (
            <div className="space-y-1">
              {referencedEntries.slice(0, 12).map((entry) => (
                <TicketWorkItemRow
                  key={`ref-${entry.key}`}
                  ticket={toRelationshipTicket(entry, projectId)}
                  {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
                  onOpen={() => onOpenTicket(projectId, entry.ticket?.id ?? entry.key)}
                  {...(onReferenceContextMenu
                    ? {
                        onContextMenu: (event: React.MouseEvent) =>
                          onReferenceContextMenu(event, entry),
                      }
                    : {})}
                />
              ))}
            </div>
          ) : (
            <div className="px-2 py-1 text-xs text-muted-foreground">No linked references.</div>
          )}
        </T3SurfaceCardContent>
      </T3SurfaceCard>
    </div>
  );
}

export function TicketRelationships({
  projectId,
  projectTickets,
  ticketId,
  displayId,
  ticketParentId,
  snapshotParentId,
  snapshotRaw,
  onOpenTicket,
}: {
  projectId: string;
  projectTickets: ProjectTicket[];
  ticketId: string;
  displayId: string;
  ticketParentId: string | undefined;
  snapshotParentId: string | undefined;
  snapshotRaw: unknown;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { parentEntry, childEntries, referencedEntries } = buildTicketRelationships({
    projectTickets,
    ticketId,
    displayId,
    ticketParentId,
    snapshotParentId,
    snapshotRaw,
  });

  return (
    <div className="space-y-4">
      <TicketParentSummary
        projectId={projectId}
        onOpenTicket={onOpenTicket}
        parentEntry={parentEntry}
      />
      <TicketRelatedLinks
        projectId={projectId}
        onOpenTicket={onOpenTicket}
        childEntries={childEntries}
        referencedEntries={referencedEntries}
      />
    </div>
  );
}
