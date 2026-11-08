import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";
import { verifyDraftPayloadHash } from "@t3tools/shared/t3team-workItemChangeSetHash";

import { operationSlot, type ResolvedOperation } from "~/t3team/changeset/t3team-changeSetModel";
import { operationPolicy } from "~/t3team/changeset/t3team-changeSetPolicy";

export const CHANGED_SINCE_PROPOSED = "Changed since proposed, not applied.";
export const MEMBER_MISSING = "The proposed change is no longer on this thread, not applied.";
export const DUPLICATE_OPERATION = "Listed twice in this change set, not applied again.";
const RECORD_BACKOFF_MS = [0, 500, 1500] as const;

export type OperationOutcome = {
  readonly draftId: string;
  readonly status:
    | "applied"
    | "dismissed"
    /** Already settled (applied or dismissed) before this run; nothing was sent. */
    | "skipped"
    /** Refused before any write: foreign or missing member, wrong provider or project, changed payload. */
    | "refused"
    /** The write was rejected, or is safe to send again. */
    | "failed"
    /** The reply was lost on a write that is not safe to repeat: it may already be in Jira. */
    | "uncertain"
    /** No headless accept path for this operation kind. */
    | "unsupported"
    /** Not attempted: an earlier change to the same field of the same issue failed. */
    | "blocked"
    /** Written to the work item, but the verdict could not be recorded. Never written again. */
    | "unrecorded";
  readonly message?: string;
};

export class UnsupportedOperationError extends Error {}
export class RefusedOperationError extends Error {}

export type ApplyDeps = {
  /** Writes the MEMBER draft's own payload; never the change set's display copies. */
  readonly acceptOp: (draft: T3TeamDraftMutationPayload) => Promise<void>;
  readonly record: (draftId: string, verdict: "applied" | "dismissed") => Promise<void>;
  /** A server answer that says the write did not happen (not a lost reply). */
  readonly isClearRejection?: (cause: unknown) => boolean;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly onOutcome?: (outcome: OperationOutcome) => void;
  readonly onProgress?: (done: number, total: number) => void;
};

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Records a verdict, retrying with a bounded backoff; throws the last error if it never lands. */
export async function recordWithRetry(
  deps: Pick<ApplyDeps, "record" | "sleep">,
  draftId: string,
  verdict: "applied" | "dismissed",
): Promise<void> {
  let last: unknown;
  for (const wait of RECORD_BACKOFF_MS) {
    if (wait > 0) await (deps.sleep ?? realSleep)(wait);
    try {
      return await deps.record(draftId, verdict);
    } catch (cause) {
      last = cause;
    }
  }
  throw last;
}

/**
 * Applies approved operations in order and dismisses rejected ones. Operations are independent: a
 * failure stays on that operation and the run continues, except that later operations on the same
 * field of the same issue are blocked. Only `draft` operations are sent, so a run resumes.
 */
export async function applyChangeSetOperations(
  input: {
    readonly approved: ReadonlyArray<ResolvedOperation>;
    readonly rejected: ReadonlyArray<ResolvedOperation>;
  } & ApplyDeps,
): Promise<ReadonlyArray<OperationOutcome>> {
  const outcomes: OperationOutcome[] = [];
  const stopped = new Set<string>();
  const total = input.approved.length + input.rejected.length;
  const settle = (outcome: OperationOutcome) => {
    outcomes.push(outcome);
    input.onOutcome?.(outcome);
    input.onProgress?.(outcomes.length, total);
  };

  for (const resolved of input.approved) {
    const { operation, draft } = resolved;
    const { draftId } = operation;
    if (resolved.state === "applied" || resolved.state === "dismissed") {
      settle({ draftId, status: "skipped" });
      continue;
    }
    if (resolved.state === "duplicate") {
      settle({ draftId, status: "refused", message: DUPLICATE_OPERATION });
      continue;
    }
    if (!draft || resolved.state === "missing") {
      settle({ draftId, status: "refused", message: MEMBER_MISSING });
      continue;
    }
    if (!verifyDraftPayloadHash(draft, operation)) {
      settle({ draftId, status: "refused", message: CHANGED_SINCE_PROPOSED });
      continue;
    }
    const slot = operationSlot(resolved);
    if (stopped.has(slot)) {
      settle({ draftId, status: "blocked", message: "An earlier change to this field failed." });
      continue;
    }
    try {
      await input.acceptOp(draft);
    } catch (cause) {
      if (cause instanceof UnsupportedOperationError || cause instanceof RefusedOperationError) {
        const status = cause instanceof RefusedOperationError ? "refused" : "unsupported";
        settle({ draftId, status, message: describe(cause) });
        continue;
      }
      stopped.add(slot);
      const certain = operationPolicy(draft).repeatable || input.isClearRejection?.(cause) === true;
      settle(
        certain
          ? { draftId, status: "failed", message: describe(cause) }
          : {
              draftId,
              status: "uncertain",
              message: `May already be in Jira; check before retrying. ${describe(cause)}`,
            },
      );
      continue;
    }
    try {
      await recordWithRetry(input, draftId, "applied");
      settle({ draftId, status: "applied" });
    } catch (cause) {
      settle({
        draftId,
        status: "unrecorded",
        message: `Applied in Jira but not recorded; do not apply it again. ${describe(cause)}`,
      });
    }
  }

  for (const { operation } of input.rejected) {
    try {
      await recordWithRetry(input, operation.draftId, "dismissed");
      settle({ draftId: operation.draftId, status: "dismissed" });
    } catch (cause) {
      settle({ draftId: operation.draftId, status: "failed", message: describe(cause) });
    }
  }
  return outcomes;
}
