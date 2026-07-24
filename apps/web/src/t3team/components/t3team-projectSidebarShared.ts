import type { ProjectShellProject } from "@t3tools/project-context";
import type {
  ProjectSortOrder,
  ProjectThread,
  ThreadSortOrder,
  ThreadStatusPill,
} from "~/t3team/t3team-types";

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

export interface DueLabelOptions {
  /** Injectable for deterministic rendering tests. */
  readonly now?: Date;
  readonly locale?: string;
  readonly timeZone?: string;
}

/** Render a scheduled-workflow wake instant as a short human deadline. */
export function formatSleepingUntil(wakeAtIso: string, options: DueLabelOptions = {}): string {
  const date = new Date(wakeAtIso);
  if (Number.isNaN(date.getTime())) return "Due later";
  const now = options.now ?? new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return "Due now";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `Due in ${minutes} min`;

  // Compare calendar dates in the viewer's timezone, not elapsed hours. This stays correct
  // close to midnight and over daylight-saving changes.
  const calendarDay = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: options.timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(value)
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
  };
  const formattedTime = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const daysAway = calendarDay(date) - calendarDay(now);
  if (daysAway === 0) return `Due today at ${formattedTime}`;
  if (daysAway === 1) {
    return `Due tomorrow at ${formattedTime}`;
  }
  const formattedDate = new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    month: "short",
    day: "numeric",
  }).format(date);
  return `Due ${formattedDate} at ${formattedTime}`;
}

export function resolveThreadStatusPill(thread: {
  status: ProjectThread["status"];
  sleepingUntil?: string;
  workflowRunStatus?: ProjectThread["workflowRunStatus"];
}): ThreadStatusPill | null {
  const run = thread.workflowRunStatus;
  if (run !== undefined) {
    const waitingSince = formatRelativeTime(run.updatedAt);
    if (run.status === "queued") {
      return {
        label: "Queued",
        detail: "Starts when capacity is free",
        colorClass: "text-slate-500 dark:text-slate-300/80",
        dotClass: "bg-slate-400 dark:bg-slate-300/80",
        pulse: false,
      };
    }
    if (run.status === "suspended") {
      return run.pendingKind === "user.input"
        ? {
            label: "Waiting for your answer",
            detail: `Waiting since ${waitingSince}`,
            colorClass: "text-amber-600 dark:text-amber-300/90",
            dotClass: "bg-amber-500 dark:bg-amber-300/90",
            pulse: false,
          }
        : {
            label: "Waiting for agent",
            detail: `Waiting since ${waitingSince}`,
            colorClass: "text-sky-600 dark:text-sky-300/80",
            dotClass: "bg-sky-500 dark:bg-sky-300/80",
            pulse: false,
          };
    }
    if (run.status === "sleeping") {
      return {
        label: "Scheduled",
        detail: run.wakeAt ? formatSleepingUntil(run.wakeAt) : "Due later",
        colorClass: "text-slate-500 dark:text-slate-300/80",
        dotClass: "bg-slate-400 dark:bg-slate-300/80",
        pulse: false,
      };
    }
    if (run.status === "paused") {
      return {
        label: "Paused",
        detail: `Paused ${waitingSince}`,
        colorClass: "text-muted-foreground",
        dotClass: "bg-muted-foreground",
        pulse: false,
      };
    }
    if (run.status === "cancelled") {
      return {
        label: "Stopped",
        detail: `Stopped ${waitingSince}`,
        colorClass: "text-muted-foreground",
        dotClass: "bg-muted-foreground",
        pulse: false,
      };
    }
    if (run.status === "running")
      return {
        label: "Running",
        detail: `Active ${waitingSince}`,
        colorClass: "text-sky-600 dark:text-sky-300/80",
        dotClass: "bg-sky-500 dark:bg-sky-300/80",
        pulse: true,
      };
    if (run.status === "completed")
      return {
        label: "Complete",
        detail: `Last activity ${waitingSince}`,
        colorClass: "text-emerald-600 dark:text-emerald-300/90",
        dotClass: "bg-emerald-500 dark:bg-emerald-300/90",
        pulse: false,
      };
    if (run.status === "failed")
      return {
        label: "Needs attention",
        detail: `Last activity ${waitingSince}`,
        colorClass: "text-red-600 dark:text-red-300/90",
        dotClass: "bg-red-500 dark:bg-red-300/90",
        pulse: false,
      };
  }
  // A scheduled-workflow run parked on the clock (Epic 27): dormant, woken at `wake_at`. Takes
  // precedence over the derived run status so the dormant thread reads "Sleeping until <time>".
  if (thread.sleepingUntil !== undefined && thread.sleepingUntil !== "") {
    return {
      label: "Sleeping",
      detail: formatSleepingUntil(thread.sleepingUntil),
      colorClass: "text-slate-500 dark:text-slate-300/80",
      dotClass: "bg-slate-400 dark:bg-slate-300/80",
      pulse: false,
    };
  }
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
    Running: 3,
    "Waiting for agent": 2,
    "Waiting for your answer": 2,
    Scheduled: 1,
    Paused: 1,
    Stopped: 0,
    Complete: 1,
    "Needs attention": 2,
    Queued: 1,
    Working: 3,
    Error: 2,
    Sleeping: 1,
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
