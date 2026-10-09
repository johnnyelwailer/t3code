/**
 * What the `RunToggle` card shows, from the run snapshot alone (doc 07 §2.2). No JSX, so the
 * state table and its copy are asserted without rendering. Counts that a docked question can
 * change ("need you", "fixing", "parked") are derived live from the run's threads whenever any
 * exist; the recipe's summary fact (`T3TeamRecipeSummaryFact`) fills in what the shells cannot
 * know: the watched total, any other counts, warnings, and the detail line.
 */
import type { T3TeamRecipeSummaryFact } from "@t3tools/contracts";

import type { RecipeRunSnapshot } from "~/state/t3team-recipeRun.logic";
import { isRunActive } from "~/state/t3team-recipeRun.logic";
import type { WatchedPullRequestWatcher } from "~/state/t3team-watchedPullRequests.logic";

export type RunToggleKind = "off" | "starting" | "on" | "failed";
export type RunToggleDotTone = "muted" | "sky" | "indigo" | "amber" | "emerald" | "red";
export type RunToggleCountBucket = "watched" | "needs-you" | "fixing" | "parked";
export type RunToggleWarning = T3TeamRecipeSummaryFact["warnings"][number];

export type RunToggleLinePart =
  | { readonly kind: "text"; readonly text: string; readonly muted?: boolean }
  | {
      readonly kind: "count";
      readonly bucket: RunToggleCountBucket;
      readonly count: number;
      readonly text: string;
      readonly emphasis?: boolean;
    }
  | { readonly kind: "failed"; readonly text: string };

export type RunToggleState = {
  readonly kind: RunToggleKind;
  readonly checked: boolean;
  readonly busy: boolean;
  readonly dot: RunToggleDotTone;
  readonly pulse: boolean;
  readonly line: ReadonlyArray<RunToggleLinePart>;
  readonly warnings: ReadonlyArray<RunToggleWarning>;
  readonly counts: Readonly<Record<RunToggleCountBucket, number>>;
};

export type RunTogglePending = "starting" | "stopping" | null;

/** Summary count ids the card derives live from the run's threads (engine contract: a docked
 * `user_input` request, an active run). Parked is the recipe's own knowledge and stays summary-read. */
const LIVE_BUCKETS: ReadonlySet<string> = new Set(["needs-you", "fixing", "parked"]);

export function relativeMinutes(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

function summaryCount(summary: T3TeamRecipeSummaryFact | null, id: string): number | undefined {
  return summary?.counts.find((count) => count.id === id)?.value;
}

/** Live counts win where the run's threads are visible; the summary covers the rest. */
export function resolveRunCounts(
  run: RecipeRunSnapshot,
): Readonly<Record<RunToggleCountBucket, number>> {
  const summary = run.home?.summary ?? null;
  const live = run.watchThreads;
  const fromLive = (predicate: (watcher: WatchedPullRequestWatcher) => boolean) =>
    live.filter(predicate).length;
  const hasLive = live.length > 0;
  return {
    watched: summaryCount(summary, "watched") ?? live.length,
    "needs-you": hasLive
      ? fromLive((w) => w.hasPendingUserInput)
      : (summaryCount(summary, "needs-you") ?? 0),
    fixing: hasLive
      ? fromLive((w) => w.tone === "working")
      : (summaryCount(summary, "fixing") ?? 0),
    parked: summaryCount(summary, "parked") ?? fromLive((w) => w.prWatch?.parked !== undefined),
  };
}

function countPart(bucket: RunToggleCountBucket, count: number, noun: string): RunToggleLinePart {
  return { kind: "count", bucket, count, text: `${count} ${noun}` };
}

export function resolveRunToggleState(input: {
  readonly run: RecipeRunSnapshot;
  readonly pending: RunTogglePending;
  readonly offDescription: string;
  readonly nowMs: number;
}): RunToggleState {
  const { run, pending } = input;
  const summary = run.home?.summary ?? null;
  const warnings = summary?.warnings ?? [];
  const counts = resolveRunCounts(run);
  const status = run.home?.workflowRunStatus ?? null;
  const active = isRunActive(status);
  const failed = status?.status === "failed";

  // The first pass is still discovering: nothing watched yet, no thread to list.
  const discovering = active && run.watchThreads.length === 0 && counts.watched === 0;
  if (pending === "starting" || discovering) {
    const activity = run.home?.activityLabel ?? "finding your PRs…";
    return {
      kind: "starting",
      checked: true,
      busy: true,
      dot: "sky",
      pulse: true,
      line: [
        { kind: "text", text: "Starting" },
        { kind: "text", text: activity },
      ],
      warnings: [],
      counts,
    };
  }
  if (!active && !failed) {
    return {
      kind: "off",
      checked: false,
      busy: pending === "stopping",
      dot: "muted",
      pulse: false,
      line: [
        { kind: "text", text: "Off" },
        { kind: "text", text: input.offDescription, muted: true },
      ],
      warnings: [],
      counts,
    };
  }

  const line: Array<RunToggleLinePart> = [];
  const needsYou = counts["needs-you"];
  // Counts the recipe alone knows ("unreadable"), after the live ones, in the recipe's order.
  const extras = (summary?.counts ?? []).filter(
    (count) => count.id !== "watched" && !LIVE_BUCKETS.has(count.id) && count.value > 0,
  );
  if (failed) {
    line.push(countPart("watched", counts.watched, "PRs still watched"));
    line.push({
      kind: "failed",
      text: `discovery failed ${status?.updatedAt ? relativeMinutes(status.updatedAt, input.nowMs) : "recently"}`,
    });
  } else {
    line.push(countPart("watched", counts.watched, "PRs watched"));
    if (needsYou > 0) {
      line.push({
        kind: "count",
        bucket: "needs-you",
        count: needsYou,
        text: `${needsYou} need${needsYou === 1 ? "s" : ""} you`,
        emphasis: true,
      });
    }
    if (counts.fixing > 0) line.push(countPart("fixing", counts.fixing, "fixing"));
    if (counts.parked > 0) line.push(countPart("parked", counts.parked, "parked"));
    for (const extra of extras) line.push({ kind: "text", text: `${extra.value} ${extra.label}` });
    if (needsYou === 0 && counts.fixing === 0 && counts.parked === 0 && extras.length === 0) {
      line.push({ kind: "text", text: "all quiet" });
      if (summary?.detail) line.push({ kind: "text", text: summary.detail, muted: true });
    }
  }

  const dot: RunToggleDotTone = failed
    ? "red"
    : warnings.length > 0
      ? "amber"
      : needsYou > 0
        ? "indigo"
        : "emerald";
  return {
    kind: failed ? "failed" : "on",
    checked: true,
    busy: pending === "stopping",
    dot,
    pulse: false,
    line,
    warnings,
    counts,
  };
}
