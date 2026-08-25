/**
 * Thread and project status pills for the sidebar: mapping a thread's raw status (plus its
 * workflow-run and sleep state) onto the single badge a row shows, and rolling several threads up
 * into the one badge a project row shows.
 *
 * Split from `t3team-projectSidebarShared.ts`, which had accumulated four unrelated concerns —
 * labels, time formatting, status pills, and sorting. This is the largest and the only one with
 * real branching, so it earns its own module and its own tests.
 */
import type { ProjectThread, ThreadStatusPill } from "~/t3team/t3team-types";
import {
  formatRelativeTime,
  formatSleepingUntil,
} from "~/t3team/components/t3team-projectSidebarTimeLabels";
import { resolveActivityStatePill, type ActivityState } from "~/t3team/t3team-activityStateDisplay";

export function resolveThreadStatusPill(
  thread: {
    status: ProjectThread["status"];
    sleepingUntil?: string;
    workflowRunStatus?: ProjectThread["workflowRunStatus"];
    activityLabel?: string | null;
    activityState?: ActivityState | null;
  },
  options: { readonly activityLabelsEnabled?: boolean } = {},
): ThreadStatusPill | null {
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
    case "running": {
      // GHE #40/#208: the live activity label is enrichment; the base word is the
      // deterministic state (thinking/writing/working/waiting) while present, else
      // today's static "Working" pill word.
      const activityLabel =
        options.activityLabelsEnabled !== false && typeof thread.activityLabel === "string"
          ? thread.activityLabel.trim() || undefined
          : undefined;
      const activityState = thread.activityState ?? undefined;
      return {
        label: "Working",
        ...(activityLabel ? { activityLabel } : {}),
        ...(activityState ? { activityState } : {}),
        colorClass: activityState
          ? resolveActivityStatePill(activityState).colorClass
          : "text-sky-600 dark:text-sky-300/80",
        dotClass: activityState
          ? resolveActivityStatePill(activityState).dotClass
          : "bg-sky-500 dark:bg-sky-300/80",
        pulse: activityState ? resolveActivityStatePill(activityState).pulse : true,
      };
    }
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

export function resolveProjectStatusIndicator(
  threads: ProjectThread[],
  options: { readonly activityLabelsEnabled?: boolean } = {},
): ThreadStatusPill | null {
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
    const pill = resolveThreadStatusPill(thread, options);
    if (!pill) continue;
    if (!highest || priority[pill.label] > priority[highest.label]) {
      highest = pill;
    }
  }
  return highest;
}
