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
 *
 * The lens makes the roll-up's non-digest views distinct instead of two copies of the flat list:
 * Hierarchy reuses the per-project depth-indented tree (`ProjectMyWorkHierarchyView`), and Board
 * reuses the per-project kanban read-only (`ProjectDashboardKanban` without a move handler).
 */
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjectMyWork } from "~/t3team/hooks/t3team-useProjectMyWork";
import { useProjectKanbanBoardColumns } from "~/t3team/hooks/t3team-useProjectKanbanBoardColumns";
import { readProjectSetupProfileIdFromProject } from "~/t3team/hooks/t3team-createProjectBootstrap";
import { JiraSessionExpiredPanel } from "~/t3team/components/t3team-JiraSessionExpiredPanel";
import { AppProjectIcon } from "~/t3team/t3team-AppStatusBits";
import { TicketWorkItemRow } from "~/t3team/t3team-ProjectDashboardItemViews";
import { ProjectMyWorkHierarchyView } from "~/t3team/t3team-ProjectMyWorkHierarchyView";
import { ProjectDashboardKanban } from "~/t3team/t3team-ProjectDashboardKanban";
import {
  buildProjectTicketHierarchy,
  type ProjectTicketHierarchy,
} from "~/t3team/t3team-ticketHierarchy";
import { buildProjectTicketKanbanColumns } from "~/t3team/t3team-projectTicketStatus";
import type { ProjectMyWorkLens } from "~/t3team/t3team-ProjectMyWorkViewSwitch";
import type { ProjectTicket } from "~/t3team/t3team-types";

/** The roll-up is read-only: no agent context menu, no ticket moves. */
const NOOP_TICKET_CONTEXT_MENU = () => undefined;
const NO_AGENT_CONTEXT = () => null;

/** Read-only per-project board: the roll-up never moves tickets. */
function AllProjectsMyWorkBoard({
  project,
  tickets,
  lastCheckedAt,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  tickets: readonly ProjectTicket[];
  lastCheckedAt?: number;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { boardColumns, availableStatuses } = useProjectKanbanBoardColumns(project);
  const profileId = useMemo(() => readProjectSetupProfileIdFromProject(project), [project]);
  const kanbanColumns = useMemo(
    () =>
      buildProjectTicketKanbanColumns(tickets, {
        profileId,
        availableStatuses,
        boardColumns,
      }),
    [availableStatuses, boardColumns, profileId, tickets],
  );
  const parentChildGroups = useMemo(() => buildProjectTicketHierarchy(tickets), [tickets]);
  return (
    <ProjectDashboardKanban
      kanbanColumns={kanbanColumns}
      allTickets={tickets}
      isHierarchyMode={false}
      parentChildGroups={parentChildGroups}
      {...(lastCheckedAt !== undefined ? { jiraLastCheckedAt: lastCheckedAt } : {})}
      projectId={project.id}
      onOpenTicket={onOpenTicket}
      onTicketContextMenu={NOOP_TICKET_CONTEXT_MENU}
    />
  );
}

/** Depth-indented parent/child tree for one project, reusing the per-project hierarchy view. */
function AllProjectsMyWorkTree({
  project,
  tickets,
  lastCheckedAt,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  tickets: readonly ProjectTicket[];
  lastCheckedAt?: number;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const hierarchy: ProjectTicketHierarchy = useMemo(
    () => buildProjectTicketHierarchy(tickets),
    [tickets],
  );
  const matchedTicketIds = useMemo(() => new Set(tickets.map((ticket) => ticket.id)), [tickets]);
  return (
    <ProjectMyWorkHierarchyView
      projectId={project.id}
      viewMode="list"
      hierarchy={hierarchy}
      contextByTicketId={new Map()}
      matchedTicketIds={matchedTicketIds}
      {...(lastCheckedAt !== undefined ? { jiraLastCheckedAt: lastCheckedAt } : {})}
      onTicketContextMenu={NOOP_TICKET_CONTEXT_MENU}
      getTicketAgentContext={NO_AGENT_CONTEXT}
      onOpenTicket={onOpenTicket}
      renderTicketExtra={() => null}
    />
  );
}

export function AllProjectsMyWorkSection({
  project,
  lens,
  onOpenTicket,
}: {
  project: ProjectShellProject;
  lens: ProjectMyWorkLens;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const { tickets, loading, error, sessionExpired, reload, lastCheckedAt } =
    useProjectMyWork(project);
  const assigned = useMemo(() => tickets ?? [], [tickets]);
  const navigate = useNavigate();

  // A project with nothing assigned is noise in a roll-up; drop the whole section rather than
  // render an empty heading per project.
  if (!loading && !error && assigned.length === 0) {
    return null;
  }

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex min-w-0 items-center gap-2">
        {/* The whole heading filters into the project's own My-work board — the roll-up is the
            overview, the project view is where the work happens. */}
        <button
          type="button"
          className="group/section-head flex min-w-0 cursor-pointer items-center gap-2 rounded-md text-left hover:text-foreground"
          onClick={() => {
            void navigate({
              to: "/t3team/projects/$projectId",
              params: { projectId: project.id },
              search: { projectView: "my-work" },
            });
          }}
        >
          <AppProjectIcon project={project} />
          <h2 className="min-w-0 truncate font-medium text-sm">{project.title}</h2>
          <span className="shrink-0 text-muted-foreground text-xs">
            {loading && assigned.length === 0 ? "Loading…" : `${assigned.length}`}
          </span>
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/section-head:opacity-100" />
        </button>
      </header>
      {sessionExpired ? (
        <JiraSessionExpiredPanel onSignedIn={reload} />
      ) : error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : lens === "board" ? (
        <AllProjectsMyWorkBoard
          project={project}
          tickets={assigned}
          {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
          onOpenTicket={onOpenTicket}
        />
      ) : lens === "hierarchy" ? (
        <AllProjectsMyWorkTree
          project={project}
          tickets={assigned}
          {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
          onOpenTicket={onOpenTicket}
        />
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
