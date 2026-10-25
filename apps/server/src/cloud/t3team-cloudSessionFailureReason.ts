import type { WorkflowJobStep, WorkflowRunSummary } from "@t3tools/shared/t3team-cloudSessionActionsRequests";

/**
 * The user-visible reason a cloud session failed, read from the provisioning
 * job's own steps rather than the run's bare conclusion (`"failure"` tells a
 * user nothing).
 *
 * A failed run is settled, so its steps can never change again: the reason is
 * derived once per run and cached, which keeps the cost at one extra `gh` call
 * per failed session for the server's lifetime — not one per poll.
 */

const GENERIC_FAILURE = "Cloud session provisioning failed.";
const NO_MACHINE = "No cloud machine became free in time. Start another to try again.";

/** Run conclusions that say more than the generic line, when no step names the failure. */
const CONCLUSION_REASONS: Readonly<Record<string, string>> = {
  timed_out: "The session hit its time limit before it became reachable.",
  startup_failure: "The provisioning workflow could not start.",
};

/** The first step that failed or timed out, in job order: that is where it broke. */
function failedStep(steps: readonly WorkflowJobStep[]): WorkflowJobStep | undefined {
  return steps.find(
    (step) =>
      (step.conclusion === "failure" || step.conclusion === "timed_out") && step.name !== "",
  );
}

/**
 * Pure: the most specific reason the run and its steps support. `steps` is
 * `null` when they could not be read, which degrades to the run-level reason.
 */
export function cloudSessionFailureReason(
  run: Pick<WorkflowRunSummary, "conclusion">,
  steps: readonly WorkflowJobStep[] | null,
): string {
  const step = steps === null ? undefined : failedStep(steps);
  if (step !== undefined) {
    return step.conclusion === "timed_out"
      ? `Timed out at “${step.name}”.`
      : `Failed at “${step.name}”.`;
  }
  // A settled run with a step still in progress lost its machine mid-step (the runner died or
  // dropped off the network); one with no step started never got a machine at all.
  if (steps !== null && run.conclusion === "failure") {
    const stranded = steps.find((candidate) => candidate.status === "in_progress");
    if (stranded !== undefined) {
      return `The cloud machine stopped responding at “${stranded.name}”. Start another to try again.`;
    }
    if (steps.length > 0 && steps.every((candidate) => candidate.status === "pending")) {
      return NO_MACHINE;
    }
    // Lost between steps: work finished up to a point and the rest never started.
    const lastDone = steps.findLast((candidate) => candidate.status === "completed");
    if (lastDone !== undefined && steps.some((candidate) => candidate.status === "pending")) {
      return `The cloud machine stopped responding after “${lastDone.name}”. Start another to try again.`;
    }
  }
  return (
    (run.conclusion === null ? undefined : CONCLUSION_REASONS[run.conclusion]) ?? GENERIC_FAILURE
  );
}

/** Enough failed runs to cover the displayed list many times over; oldest evicted first. */
const FAILURE_REASON_CACHE_LIMIT = 200;

/**
 * Unreadable steps reads a run gets before its run-level reason is pinned. A
 * flaky `gh` call deserves a retry; a permanent one (truncated output, a
 * revoked token) must not cost a call on every poll forever.
 */
const UNREADABLE_READ_LIMIT = 3;

/**
 * Per-run failure reasons and unreadable-read counts, keyed by run id AND attempt (a re-run keeps
 * its id, and its second failure is not the first one's). One per service instance.
 */
export interface FailureReasonCache {
  readonly reasons: Map<string, string>;
  readonly unreadableReads: Map<string, number>;
}

type AttemptedRun = Pick<WorkflowRunSummary, "id" | "runAttempt">;

/** `null` when the run does not say its attempt: a re-run could not be told apart, so not cached. */
const attemptKey = (run: AttemptedRun): string | null =>
  run.runAttempt === undefined ? null : `${run.id}#${run.runAttempt}`;

export const makeFailureReasonCache = (): FailureReasonCache => ({
  reasons: new Map(),
  unreadableReads: new Map(),
});

/**
 * The cached reason for a settled failed run, or `undefined` when it has not
 * been derived yet.
 */
export function cachedFailureReason(
  cache: FailureReasonCache | undefined,
  run: AttemptedRun,
): string | undefined {
  const key = attemptKey(run);
  return key === null ? undefined : cache?.reasons.get(key);
}

const boundedSet = <V>(map: Map<string, V>, key: string, value: V): void => {
  if (!map.has(key) && map.size >= FAILURE_REASON_CACHE_LIMIT) {
    const oldest = map.keys().next();
    if (oldest.done !== true) map.delete(oldest.value);
  }
  map.set(key, value);
};

/**
 * Record one steps read. A reason from READABLE steps is final. An unreadable
 * read is retried on later lists, up to `UNREADABLE_READ_LIMIT`, after which
 * the run-level reason is pinned.
 */
export function recordFailureRead(
  cache: FailureReasonCache | undefined,
  run: AttemptedRun,
  reason: string,
  readable: boolean,
): void {
  const key = attemptKey(run);
  if (cache === undefined || key === null) return;
  const misses = readable ? 0 : (cache.unreadableReads.get(key) ?? 0) + 1;
  if (readable || misses >= UNREADABLE_READ_LIMIT) {
    cache.unreadableReads.delete(key);
    boundedSet(cache.reasons, key, reason);
    return;
  }
  boundedSet(cache.unreadableReads, key, misses);
}
