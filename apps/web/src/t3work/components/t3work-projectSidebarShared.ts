import type { ProjectShellProject } from "@t3tools/project-context";
import type {
  ProjectSortOrder,
  ProjectThread,
  ThreadSortOrder,
  ThreadStatusPill,
} from "~/t3work/t3work-types";

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

export function resolveThreadStatusPill(thread: {
  status: ProjectThread["status"];
}): ThreadStatusPill | null {
  switch (thread.status) {
    case "running":
      return {
        label: "Working",
        colorClass: "text-sky-600 dark:text-sky-300/80",
        dotClass: "bg-sky-500 dark:bg-sky-300/80",
        pulse: true,
      };
    case "completed":
      return {
        label: "Completed",
        colorClass: "text-emerald-600 dark:text-emerald-300/90",
        dotClass: "bg-emerald-500 dark:bg-emerald-300/90",
        pulse: false,
      };
    case "error":
      return {
        label: "Error",
        colorClass: "text-red-600 dark:text-red-300/90",
        dotClass: "bg-red-500 dark:bg-red-300/90",
        pulse: false,
      };
    default:
      return null;
  }
}

export function resolveProjectStatusIndicator(threads: ProjectThread[]): ThreadStatusPill | null {
  const priority: Record<ThreadStatusPill["label"], number> = {
    Working: 3,
    Error: 2,
    Completed: 1,
    Idle: 0,
  };
  let highest: ThreadStatusPill | null = null;
  for (const thread of threads) {
    const pill = resolveThreadStatusPill(thread);
    if (!pill) continue;
    if (!highest || priority[pill.label] > priority[highest.label]) {
      highest = pill;
    }
  }
  return highest;
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

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
