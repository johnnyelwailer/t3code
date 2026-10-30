import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";

import {
  applyChangeSetOperations,
  recordWithRetry,
  UnsupportedOperationError,
  type ApplyDeps,
} from "~/t3team/changeset/t3team-changeSetApply";
import type { ResolvedOperation } from "~/t3team/changeset/t3team-changeSetModel";
import { useChangeSetOutcomeStore } from "~/t3team/changeset/t3team-changeSetOutcomeStore";

export type ChangeSetDeps = Pick<ApplyDeps, "record" | "isClearRejection" | "sleep"> & {
  /** Absent when the thread's project has no usable Jira account (see `unavailableReason`). */
  readonly acceptOp?: (draft: T3TeamDraftMutationPayload) => Promise<void>;
  readonly unavailableReason?: string;
  readonly recordDiscard: (changeSetId: string) => Promise<void>;
};

const store = () => useChangeSetOutcomeStore.getState();

/**
 * Runs outside React so an unmounted card does not stop a write half way: every result goes to the
 * outcome store as it happens, and a second run for the same set cannot start while one is in flight.
 */
export async function runChangeSet(input: {
  readonly changeSetId: string;
  readonly deps: ChangeSetDeps;
  readonly approved: ReadonlyArray<ResolvedOperation>;
  readonly rejected: ReadonlyArray<ResolvedOperation>;
}): Promise<void> {
  const { changeSetId, deps } = input;
  const total = input.approved.length + input.rejected.length;
  if (total === 0 || store().running.has(changeSetId)) return;
  const unavailable = new UnsupportedOperationError(
    deps.unavailableReason ?? "Apply is unavailable.",
  );
  store().setRunning(changeSetId, { done: 0, total });
  try {
    await applyChangeSetOperations({
      ...deps,
      acceptOp: deps.acceptOp ?? (() => Promise.reject(unavailable)),
      approved: input.approved,
      rejected: input.rejected,
      onOutcome: store().setOutcome,
      onProgress: (done, count) => store().setRunning(changeSetId, { done, total: count }),
    });
  } finally {
    store().setRunning(changeSetId, null);
  }
}

/** Settles one operation by recording its verdict only: "already applied", dismiss, retry recording. */
export async function recordOperationVerdict(
  deps: ChangeSetDeps,
  draftId: string,
  verdict: "applied" | "dismissed",
): Promise<void> {
  try {
    await recordWithRetry(deps, draftId, verdict);
    store().setOutcome({ draftId, status: verdict });
  } catch (cause) {
    // A held operation stays held: only a recorded verdict releases it (see the outcome store).
    const message = cause instanceof Error ? cause.message : String(cause);
    store().setOutcome(
      verdict === "applied"
        ? {
            draftId,
            status: "unrecorded",
            message: `Applied in Jira but not recorded; do not apply it again. ${message}`,
          }
        : { draftId, status: "failed", message },
    );
  }
}
