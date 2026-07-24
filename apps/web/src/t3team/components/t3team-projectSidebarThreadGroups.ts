import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import { resolveCanonicalProjectTicketId } from "~/t3team/t3team-ticketLookup";
import type { ProjectThread, ProjectTicket } from "~/t3team/t3team-types";

type DashboardThreadsByMode = Record<ProjectDashboardMode, ProjectThread[]>;

type BuildProjectSidebarThreadGroupsOptions = {
  visibleTicketIds?: ReadonlySet<string>;
  ticketLookup?: ReadonlyMap<string, ProjectTicket>;
};

export function buildProjectSidebarThreadGroups(
  threads: ReadonlyArray<ProjectThread>,
  options: BuildProjectSidebarThreadGroupsOptions = {},
): {
  projectLevelThreads: ProjectThread[];
  dashboardThreadsByMode: DashboardThreadsByMode;
  ticketThreadsById: Map<string, ProjectThread[]>;
} {
  const projectLevelThreads: ProjectThread[] = [];
  const dashboardThreadsByMode: DashboardThreadsByMode = {
    backlog: [],
    "my-work": [],
  };
  const ticketThreadsById = new Map<string, ProjectThread[]>();
  const visibleTicketIds = options.visibleTicketIds;

  for (const thread of threads) {
    const ticketId = resolveCanonicalProjectTicketId(thread.ticketId, options.ticketLookup);

    if (ticketId) {
      if (visibleTicketIds && !visibleTicketIds.has(ticketId)) {
        projectLevelThreads.push(thread);
        continue;
      }

      const existing = ticketThreadsById.get(ticketId) ?? [];
      existing.push(thread);
      ticketThreadsById.set(ticketId, existing);
      continue;
    }

    if (thread.dashboardMode) {
      dashboardThreadsByMode[thread.dashboardMode].push(thread);
      continue;
    }

    projectLevelThreads.push(thread);
  }

  return {
    projectLevelThreads,
    dashboardThreadsByMode,
    ticketThreadsById,
  };
}
