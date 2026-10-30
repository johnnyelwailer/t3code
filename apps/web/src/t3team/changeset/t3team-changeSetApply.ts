import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";
import { verifyDraftPayloadHash } from "@t3tools/shared/t3team-workItemChangeSetHash";

import type { ResolvedOperation } from "~/t3team/changeset/t3team-changeSetModel";

export const CHANGED_SINCE_PROPOSED = "Changed since proposed, not applied.";
export const MEMBER_MISSING = "The proposed change is no longer on this thread, not applied.";

export type OperationOutcome = {
  readonly draftId: string;
  readonly status:
    | "applied"
    | "dismissed"
    /** Already settled (applied or dismissed) before this run; nothing was sent. */
    | "skipped"
    /** Refused before any write: foreign or missing member, or a payload that no longer matches. */
    | "refused"
    | "failed"
    /** No headless accept path for this operation kind. */
    | "unsupported"
    /** Not attempted: an earlier change to the same field of the same issue failed. */
    | "blocked"
    /** Written to the work item, but the verdict was not recorded; a retry only records it. */
    | "unrecorded";
  readonly message?: string;
};

export class UnsupportedOperationError extends Error {}

export type ApplyDeps = {
  /** Writes the MEMBER draft's own payload; never the change set's display copies. */
  readonly acceptOp: (draft: T3TeamDraftMutationPayload) => Promise<void>;
  readonly record: (draftId: string, verdict: "applied" | "dismissed") => Promise<void>;
  readonly onProgress?: (done: number, total: number) => void;
};

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/**
 * Applies approved operations in order and dismisses rejected ones. Operations are independent:
 * a failure is recorded on that operation and the run continues, except that a failed write to an
 * issue's field stops the rest of that issue when a later operation targets the same field.
 * Idempotent: only operations still `draft` are sent; `unrecordedDraftIds` are only re-recorded.
 */
export async function applyChangeSetOperations(
  input: {
    readonly approved: ReadonlyArray<ResolvedOperation>;
    readonly rejected: ReadonlyArray<ResolvedOperation>;
    readonly unrecordedDraftIds?: ReadonlySet<string>;
  } & ApplyDeps,
): Promise<ReadonlyArray<OperationOutcome>> {
  const { acceptOp, record, onProgress } = input;
  const outcomes: OperationOutcome[] = [];
  const stoppedIssues = new Set<string>();
  const total = input.approved.length + input.rejected.length;
  const settle = (outcome: OperationOutcome) => {
    outcomes.push(outcome);
    onProgress?.(outcomes.length, total);
  };

  for (const [index, resolved] of input.approved.entries()) {
    const { operation, draft } = resolved;
    const { draftId } = operation;
    if (resolved.state === "applied" || resolved.state === "dismissed") {
      settle({ draftId, status: "skipped" });
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
    const issueKey = draft.target.issueIdOrKey;
    if (stoppedIssues.has(issueKey)) {
      settle({ draftId, status: "blocked", message: "An earlier change to this field failed." });
      continue;
    }
    const alreadyWritten = input.unrecordedDraftIds?.has(draftId) === true;
    try {
      if (!alreadyWritten) await acceptOp(draft);
    } catch (cause) {
      const unsupported = cause instanceof UnsupportedOperationError;
      const sameFieldLater = input.approved
        .slice(index + 1)
        .some(
          (later) =>
            later.draft?.target.issueIdOrKey === issueKey && later.draft.field === draft.field,
        );
      if (sameFieldLater) stoppedIssues.add(issueKey);
      settle({
        draftId,
        status: unsupported ? "unsupported" : "failed",
        message: describe(cause),
      });
      continue;
    }
    try {
      await record(draftId, "applied");
      settle({ draftId, status: "applied" });
    } catch (cause) {
      settle({
        draftId,
        status: "unrecorded",
        message: `Applied, but recording it failed: ${describe(cause)}`,
      });
    }
  }

  for (const { operation } of input.rejected) {
    try {
      await record(operation.draftId, "dismissed");
      settle({ draftId: operation.draftId, status: "dismissed" });
    } catch (cause) {
      settle({ draftId: operation.draftId, status: "failed", message: describe(cause) });
    }
  }
  return outcomes;
}
