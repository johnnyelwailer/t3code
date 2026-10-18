import {
  foldBackgroundJobs,
  type BackgroundJobState,
} from "@t3tools/client-runtime/work-log/background-jobs";
import { useState } from "react";

import { resolveHttpBaseUrl } from "~/t3team/backend/t3team-t3BackendHttp";
import {
  createThreadJobsController,
  type ThreadJobsController,
} from "~/t3team/backend/t3team-thread-jobsBackend";
import { resolveWsBaseUrl } from "~/t3team/t3team-route-surface-wsUrl";

import type { TimelineEntry } from "../../session-logic";

export interface T3TeamBackgroundJobFold {
  readonly jobs: readonly BackgroundJobState[];
  readonly starters: ReadonlyMap<string, BackgroundJobState>;
  readonly startEntryIds: ReadonlySet<string>;
}

/** Job states are flat records of primitives, so a key-wise compare is exact. */
function sameBackgroundJobs(
  previous: readonly BackgroundJobState[],
  next: readonly BackgroundJobState[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every((job, index) => {
      const other = next[index];
      if (other === undefined) return false;
      const keys = Object.keys(job) as Array<keyof BackgroundJobState>;
      return (
        keys.length === Object.keys(other).length && keys.every((key) => job[key] === other[key])
      );
    })
  );
}

/**
 * Background bash jobs as of now. No provider event marks job start/settle, so the fold is
 * transcript-driven: the "background job: job_xxx" marker in a tool result opens the job, later
 * process-tool results settle it, and the marker's hard deadline keeps stale threads quiet
 * (client-runtime work-log/background-jobs). The clock is read when the transcript changes.
 */
function foldTimelineBackgroundJobs(
  timelineEntries: ReadonlyArray<TimelineEntry>,
  serverStartedAtMs: number | null | undefined,
): readonly BackgroundJobState[] {
  const foldEntries = timelineEntries
    .filter((entry): entry is Extract<TimelineEntry, { kind: "work" }> => entry.kind === "work")
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      detail: entry.entry.detail,
      // Rows persisted before the pack named its commands carry the result text
      // here instead, with `detail` empty — see BackgroundJobFoldEntry.command.
      command: entry.entry.command,
      // The tool call's human label, so the job row reads like the tool card.
      label: entry.entry.label,
    }));
  return foldBackgroundJobs(foldEntries, Date.now(), serverStartedAtMs ?? undefined);
}

function backgroundJobFoldOf(jobs: readonly BackgroundJobState[]): T3TeamBackgroundJobFold {
  const starters = new Map<string, BackgroundJobState>();
  for (const job of jobs) {
    if (job.state === "running" && job.startedEntryId !== undefined) {
      starters.set(job.startedEntryId, job);
    }
  }
  return { jobs, starters, startEntryIds: new Set(starters.keys()) };
}

/**
 * The timeline's background-job fold. It feeds the row derivation (a running job keeps the
 * working-row slot alive after the run settles; a collapsed tool group needs to know one of its
 * hidden rows started a job), so an unchanged fold keeps its identity: text streaming must not
 * invalidate the rows projection or the shared row context.
 */
export function useT3TeamBackgroundJobFold(
  timelineEntries: ReadonlyArray<TimelineEntry>,
  serverStartedAtMs: number | null | undefined,
): T3TeamBackgroundJobFold {
  const jobs = foldTimelineBackgroundJobs(timelineEntries, serverStartedAtMs);
  const [fold, setFold] = useState(() => backgroundJobFoldOf(jobs));
  if (fold.jobs !== jobs && !sameBackgroundJobs(fold.jobs, jobs)) {
    const next = backgroundJobFoldOf(jobs);
    setFold(next);
    return next;
  }
  return fold;
}

function createThreadJobsControllerForSurface(): ThreadJobsController | undefined {
  try {
    return createThreadJobsController(resolveHttpBaseUrl(resolveWsBaseUrl()));
  } catch {
    return undefined;
  }
}

/**
 * Out-of-band job control for the background-jobs indicator. The backend URL is stable for the
 * life of this surface; a broken URL degrades to no affordances rather than a crash.
 */
export function useT3TeamThreadJobsController(): ThreadJobsController | undefined {
  const [controller] = useState(createThreadJobsControllerForSurface);
  return controller;
}
