import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectSortOrder, ProjectThread, ThreadSortOrder } from "~/t3team/t3team-types";

// Re-exported so the many sidebar rows importing them from here keep working.
export {
  formatRelativeTime,
  formatSleepingUntil,
  type DueLabelOptions,
} from "~/t3team/components/t3team-projectSidebarTimeLabels";
export {
  resolveProjectStatusIndicator,
  resolveThreadStatusPill,
} from "~/t3team/components/t3team-projectSidebarStatusPills";

export type TicketViewMode = "flat" | "tree";

export const PROJECT_SORT_LABELS: Record<ProjectSortOrder, string> = {
  updated_at: "Last message",
  created_at: "Created at",
};

export const THREAD_SORT_LABELS: Record<ThreadSortOrder, string> = {
  updated_at: "Last message",
  created_at: "Created at",
};

export const TICKET_VIEW_LABELS: Record<TicketViewMode, string> = {
  flat: "Flat",
  tree: "Hierarchy",
};

export function sortThreads(threads: ProjectThread[], sortOrder: ThreadSortOrder): ProjectThread[] {
  return [...threads].sort((a, b) => {
    const aTime =
      sortOrder === "updated_at"
        ? new Date(a.lastMessageAt).getTime()
        : new Date(a.createdAt).getTime();
    const bTime =
      sortOrder === "updated_at"
        ? new Date(b.lastMessageAt).getTime()
        : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
}

export function sortProjects(
  projects: ProjectShellProject[],
  threadsByProject: Map<string, ProjectThread[]>,
  sortOrder: ProjectSortOrder,
): ProjectShellProject[] {
  if (sortOrder === "created_at") {
    return [...projects].sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    });
  }
  return [...projects].sort((a, b) => {
    const aThreads = threadsByProject.get(a.id) ?? [];
    const bThreads = threadsByProject.get(b.id) ?? [];
    const aLatest = aThreads.reduce(
      (latest, t) => Math.max(latest, new Date(t.lastMessageAt).getTime()),
      0,
    );
    const bLatest = bThreads.reduce(
      (latest, t) => Math.max(latest, new Date(t.lastMessageAt).getTime()),
      0,
    );
    return bLatest - aLatest;
  });
}
