import { ProjectMyWorkTicketExtra } from "~/t3team/t3team-ProjectMyWorkTicketExtra";
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
}) {
  return (
    <ProjectMyWorkTicketExtra
      ticket={input.ticket}
      {...(input.compact ? { compact: input.compact } : {})}
    />
  );
}
