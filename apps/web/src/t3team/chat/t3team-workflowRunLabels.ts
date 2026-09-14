/**
 * The words and statuses a live workflow-run card shows — no JSX, so the copy and the state machine
 * can be asserted without rendering a card.
 *
 * Split out of `t3team-messageShapeCardLive` when that file outgrew the 200-line cap: the label rules
 * (what "waiting" is called, which step counts as the active one, when a run reads as suspended vs
 * sleeping) are decisions worth reading on their own, separate from the chrome that draws them.
 */

import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import type {
  T3TeamWorkflowRunProgress,
  T3TeamWorkflowStepEntry,
} from "~/t3team/chat/t3team-threadWorkflowStepProgress";

export function relativeAge(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function liveRunLabel(steps: ReadonlyArray<T3TeamWorkflowStepEntry>): string {
  const pending = [...steps]
    .toReversed()
    .find((step) => step.phase === "started" || step.phase === "waiting");
  if (pending === undefined) return "Running";
  // "since just now" says nothing a bare status doesn't already say, and it was a large part of
  // what made this compact status pill wrap across three lines — drop it. A genuinely aged wait
  // ("since 5m ago", "since 2h ago") stays: that IS information, not verbosity.
  const age = pending.updatedAt === undefined ? undefined : relativeAge(pending.updatedAt);
  const since = age === undefined || age === "just now" ? "" : ` since ${age}`;
  if (pending.stepKind === "thread.turn") return `Waiting for agent${since}`;
  if (pending.stepKind === "user.input") return `Waiting for your answer${since}`;
  if (pending.stepKind === "wait.until") return "Scheduled";
  return `Running${since}`;
}

export function inferredRunStatus(
  progress: T3TeamWorkflowRunProgress,
): OrchestrationWorkflowRunStatus["status"] {
  if (
    progress.run?.phase === "completed" ||
    progress.run?.phase === "failed" ||
    progress.run?.phase === "paused" ||
    progress.run?.phase === "cancelled"
  ) {
    return progress.run.phase;
  }
  const active = [...progress.steps]
    .toReversed()
    .find((step) => step.phase === "started" || step.phase === "waiting");
  if (active?.stepKind === "wait.until") return "sleeping";
  if (active?.stepKind === "thread.turn" || active?.stepKind === "user.input") {
    return "suspended";
  }
  return "running";
}

export function repairStatus(steps: ReadonlyArray<T3TeamWorkflowStepEntry>): {
  readonly label: string;
  readonly reason?: string;
  readonly step: T3TeamWorkflowStepEntry;
} | null {
  const latest = [...steps].toReversed().find((step) => step.stepKind === "workflow.self-heal");
  if (latest === undefined) return null;
  const reason = [...steps]
    .toReversed()
    .find((step) => step.stepKind === "workflow.self-heal" && step.error)?.error;
  if (latest.phase === "failed") return { label: "Needs attention", step: latest };
  if (latest.phase === "completed") return { label: "Orchestration ready", step: latest };
  if (latest.detail === "Resuming workflow")
    return { label: "Starting orchestration", ...(reason ? { reason } : {}), step: latest };
  // Self-heal/repair internals stay out of normal UI.
  return { label: "Getting orchestration ready", ...(reason ? { reason } : {}), step: latest };
}

export function formatWorkflowStepDue(
  wakeAtIso: string | undefined,
  options: { now?: Date; locale?: string; timeZone?: string } = {},
): string | null {
  if (!wakeAtIso) return null;
  const wakeAt = new Date(wakeAtIso);
  if (Number.isNaN(wakeAt.getTime())) return null;
  const now = options.now ?? new Date();
  const diffMs = wakeAt.getTime() - now.getTime();
  if (diffMs <= 0) return "now";
  if (diffMs < 60_000) return `in ${Math.ceil(diffMs / 1000)} sec`;
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `in ${minutes} min`;

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
  const daysAway = calendarDay(wakeAt) - calendarDay(now);
  if (daysAway === 0) {
    return new Intl.DateTimeFormat(options.locale, {
      timeZone: options.timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(wakeAt);
  }
  if (daysAway === 1) return "tomorrow";
  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(wakeAt);
}
