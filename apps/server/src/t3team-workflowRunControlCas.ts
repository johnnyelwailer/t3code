/**
 * Compare-and-set helpers for `controlWorkflowRun` (GHE #411 §1): closes the TOCTOU window
 * between the control path's read of a run row and its write — a run that completes/fails in
 * between must be reported, not silently overwritten by a stale pause/stop.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { WorkflowRunRepositoryShape } from "./persistence/Services/WorkflowRuns.ts";

/** Non-terminal statuses stop's compare-and-set write is allowed to move away from — the
 * complement of `completed` / `failed` / `cancelled`. */
export const NON_TERMINAL_STATUSES = [
  "queued",
  "running",
  "suspended",
  "sleeping",
  "paused",
] as const;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A compare-and-set write found the row already moved. Re-read it so the failure names what it
 * actually is now, instead of silently overwriting a run that already settled. */
export const reportStaleWrite = (
  repo: WorkflowRunRepositoryShape,
  runId: string,
): Effect.Effect<never, string> =>
  repo.getById({ runId }).pipe(
    Effect.mapError(errorMessage),
    Effect.flatMap((found) =>
      Effect.fail(
        Option.isSome(found)
          ? `Workflow already finished (${found.value.status}).`
          : "Workflow run no longer exists.",
      ),
    ),
  );
