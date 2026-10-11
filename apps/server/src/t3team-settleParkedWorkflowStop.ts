/**
 * A user's settle of a thread whose only unfinished workflow runs are PARKED (sleeping on a
 * clock, watching a signal, suspended on an ask, or paused) stops those runs first, through the
 * same `controlWorkflowRun` stop as the card's Stop button, so the settle is not a dead end. An
 * ephemeral recurring run that re-wakes its thread for a month must not make the thread
 * unsettleable.
 *
 * Runs at the user's command intake (ws.ts, wired in t3team-settleParkedWorkflowStopLive.ts),
 * before the orchestrator dispatch: the settle guard runs under the thread lock and must stay
 * read-only, while a stop writes the run row and interrupts child threads (commands on other
 * threads). Not applied to server-originated settles (auto-settle, the child sweeper): work is
 * never cancelled on a timer. A run that is actively executing, or any other settle blocker,
 * leaves everything untouched and the guard's refusal explains what to do.
 *
 * The stop is narrow (`stopOnlyIf`: CAS first, in-memory cancel after), so a run the scheduler
 * woke between the read and the stop is left running. The first failed stop ends the sequence; if
 * the settle is then refused, the refusal says which runs were already stopped.
 */
import type { CommandId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { OrchestratorDispatchError } from "./orchestration-v2/Orchestrator.ts";
import { userFacingDispatchErrorMessage } from "./orchestration-v2/UserFacingErrors.ts";
import { PARKED_WORKFLOW_STATUSES } from "./t3team-childSettleGuards.ts";
import { settleGuardInput, type T3TeamSettleGuardCheck } from "./t3team-v2/t3team-settleGuard.ts";
import { controlWorkflowRun, type WorkflowRunControlDeps } from "./t3team-workflowRunControl.ts";

export interface SettleParkedWorkflowStopDeps {
  readonly control: Omit<WorkflowRunControlDeps, "stopOrigin" | "stopOnlyIf">;
  /** The settle guard with only actively executing own runs blocking. */
  readonly guardIgnoringParkedRuns: T3TeamSettleGuardCheck;
}

export interface SettleCommand {
  readonly threadId: ThreadId;
  readonly commandId: CommandId;
}

const parked = new Set<string>(PARKED_WORKFLOW_STATUSES);

/** Stops the thread's parked runs when that alone would let a user settle through; returns the
 * ids of the runs it stopped (stopping at the first failure). */
export const stopParkedWorkflowRunsForSettle = Effect.fn("stopParkedWorkflowRunsForSettle")(
  function* (deps: SettleParkedWorkflowStopDeps, command: SettleCommand) {
    const input = settleGuardInput(command);
    const stopped: Array<string> = [];
    if (input.origin !== "user") return stopped;
    const runs = yield* deps.control.repo
      .listLiveByLaunchThread({ launchThreadId: command.threadId })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("settle could not list workflow runs", { error }).pipe(Effect.as([])),
        ),
      );
    if (runs.length === 0 || runs.some((run) => !parked.has(run.status))) return stopped;
    if ((yield* deps.guardIgnoringParkedRuns(input)) !== null) return stopped;
    const control: WorkflowRunControlDeps = {
      ...deps.control,
      stopOrigin: "user",
      stopOnlyIf: PARKED_WORKFLOW_STATUSES,
    };
    for (const run of runs) {
      const failure = yield* controlWorkflowRun(control, run, {
        threadId: command.threadId,
        action: "stop",
      }).pipe(Effect.flip, Effect.option);
      if (failure._tag === "Some") {
        yield* Effect.logWarning("settle could not stop a parked workflow run", {
          runId: run.runId,
          message: failure.value,
          alreadyStopped: stopped,
        });
        break;
      }
      stopped.push(run.runId);
    }
    return stopped;
  },
);

/** Runs the parked-run stop, then `dispatch`. A settle refused after some runs were stopped
 * says so, so the user is not left guessing why those runs are gone. */
export const settleWithParkedWorkflowRunsStopped = <A, E, R>(
  deps: SettleParkedWorkflowStopDeps,
  command: SettleCommand,
  dispatch: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | OrchestratorDispatchError, R> =>
  Effect.gen(function* () {
    const stopped = yield* stopParkedWorkflowRunsForSettle(deps, command);
    if (stopped.length === 0) return yield* dispatch;
    return yield* dispatch.pipe(
      Effect.mapError(
        (error) =>
          new OrchestratorDispatchError({
            commandId: command.commandId,
            commandType: "thread.settle",
            cause:
              `${userFacingDispatchErrorMessage(error) ?? "The thread could not be settled."} ` +
              `Parked workflow runs already stopped for this settle: ${stopped.join(", ")}.`,
          }),
      ),
    );
  });
