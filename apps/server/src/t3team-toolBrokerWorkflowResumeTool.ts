/**
 * `t3team.orchestration.resume` — broker tool resuming a paused/failed workflow run from its
 * journal (Epic 25 resume/replay semantics), optionally with corrected source for an
 * ephemeral run, or corrected args for an input-contract fault (any origin — see
 * `WorkflowInputDecodeError`). Scoped to the CALLING thread via the run row's `launchThreadId`,
 * like `t3team.orchestration.status` — an unknown id and another thread's run answer identically.
 *
 *   • `paused` — restores the parked continuation (pending ask back into the registry, or the
 *     scheduler re-armed for a timer park), mirroring the HTTP control route's resume action.
 *   • `failed` — re-drives {@link resumeWorkflowRunFromJournal}: same-prefix replay returns
 *     journaled results verbatim and executes live past the recorded frontier. Runs detached
 *     (a resume can suspend again for hours); observe it via `t3team.orchestration.status`.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  makeResumePausedRun,
  replaceRunArgsIfRequested,
  replaceRunSourceIfRequested,
  type WorkflowResumeToolDeps,
} from "./t3team-toolBrokerWorkflowResumeActions.ts";
import { makeResumeFailedRun } from "./t3team-toolBrokerWorkflowResumeFailed.ts";

export interface ResumeWorkflowHandlerArgs {
  readonly runId?: string | undefined;
  readonly source?: string | undefined;
  /** Corrected launch args (an input-contract repair): the workflow's SOURCE was correct, the
   * CALLER's args were not. See `WorkflowInputDecodeError` / the orchestration manual's guidance
   * to resume-with-corrected-args instead of re-launching (which would create a duplicate card). */
  readonly args?: unknown;
}

export interface WorkflowResumeToolValue {
  readonly ok: true;
  readonly runId: string;
  readonly status: "accepted" | "suspended" | "sleeping";
  /** The reason the run had failed before this resume (migration 044) — so an agent that
   * resumes blind still learns the cause it may need to fix. Absent for a paused run. */
  readonly failureReason?: string | undefined;
  /** Where it had failed — settle phase plus the primitive in flight (migration 044). */
  readonly failureStep?: string | undefined;
  readonly hint: string;
}

export type T3TeamWorkflowResumeToolHandlers = {
  readonly resumeWorkflowRun: (
    args: ResumeWorkflowHandlerArgs,
  ) => Effect.Effect<WorkflowResumeToolValue, string>;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const notFoundHint = (runId: string) =>
  `No orchestration run found for runId '${runId}'. Use t3team.orchestration.status to list your ` +
  "recent runs.";

/** Build the per-thread `t3team.orchestration.resume` handler factory. */
export function makeWorkflowResumeToolHandlers<E>(
  deps: WorkflowResumeToolDeps<E>,
): (threadId: ThreadId) => T3TeamWorkflowResumeToolHandlers {
  return (threadId) => ({
    resumeWorkflowRun: (args) =>
      Effect.gen(function* () {
        const runId = args.runId?.trim() ?? "";
        if (runId.length === 0) {
          return yield* Effect.fail("t3team.orchestration.resume requires a runId.");
        }
        const found = yield* deps.runRepository
          .getById({ runId })
          .pipe(Effect.mapError(errorMessage));
        if (Option.isNone(found) || found.value.launchThreadId !== String(threadId)) {
          return yield* Effect.fail(notFoundHint(runId));
        }
        const run: WorkflowRun = found.value;
        if (run.status !== "paused" && run.status !== "failed") {
          return yield* Effect.fail(
            `Workflow run '${runId}' is ${run.status}; only a paused or failed run can be resumed.`,
          );
        }
        yield* replaceRunSourceIfRequested(deps, threadId, run, args.source);
        yield* replaceRunArgsIfRequested(deps, run, args.args);
        if (run.status === "paused") {
          return yield* makeResumePausedRun(deps)(run);
        }
        // `run` was fetched BEFORE the args correction above; the failed-run re-drive replays
        // with whatever `.args` it is handed, so a corrected value must be threaded in here —
        // re-fetching the row would work too, but this avoids a redundant round-trip.
        const runToResume: WorkflowRun = args.args === undefined ? run : { ...run, args: args.args };
        return yield* makeResumeFailedRun(deps, threadId, () => t3teamRandomUUID())(runToResume);
      }),
  });
}
