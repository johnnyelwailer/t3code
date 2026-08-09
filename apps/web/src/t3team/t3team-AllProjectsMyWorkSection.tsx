/**
 * One bound project's slice of the all-projects "My work" roll-up.
 *
 * Built on `useProjectMyWork` — the FETCH-only hook — deliberately, not on `ProjectDashboardMyWorkView`.
 * That view is a singleton by construction and breaks when instantiated once per project:
 *  - it requires `T3TeamDashboardRecipeActionProvider`, mounted only by `AppDashboardPane`, so N
 *    copies outside that pane throw on render;
 *  - its `useProjectMyWorkState` persists UI state into the ROUTE SEARCH, which is global to the
 *    URL — N instances race on mount and then all converge on whichever wrote last, overwriting
 *    every project's saved My Work view;
 *  - the recipe-action registry holds a single handler slot, so an agent action would silently
 *    address one arbitrary section.
 * A read-only roll-up needs none of that machinery, so it takes none of it.
 */
import { useMemo } from "react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjectMyWork } from "~/t3team/hooks/t3team-useProjectMyWork";
import { AppProjectIcon } from "~/t3team/t3team-AppStatusBits";
import { TicketWorkItemRow } from "~/t3team/t3team-ProjectDashboardItemViews";

export function AllProjectsMyWorkSection({
  project,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { tickets, loading, error, lastCheckedAt } = useProjectMyWork(project);
  const assigned = useMemo(() => tickets ?? [], [tickets]);

  // A project with nothing assigned is noise in a roll-up; drop the whole section rather than
  // render an empty heading per project.
  if (!loading && !error && assigned.length === 0) {
    return null;
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex min-w-0 items-center gap-2">
        <AppProjectIcon project={project} />
        <h2 className="min-w-0 truncate font-medium text-sm">{project.title}</h2>
        <span className="shrink-0 text-muted-foreground text-xs">
          {loading && assigned.length === 0 ? "Loading…" : `${assigned.length}`}
        </span>
      </header>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <div className="flex min-w-0 flex-col">
          {assigned.map((ticket) => (
            <TicketWorkItemRow
              key={ticket.id}
              ticket={ticket}
              {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
              onOpen={() => onOpenTicket(project.id, ticket.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
