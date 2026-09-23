/**
 * `t3team.orchestration.pause` / `t3team.orchestration.stop` — broker tools letting an agent
 * control a workflow run IT launched, with the same semantics as the card's Pause / Stop buttons
 * (GHE #403 §4: the orchestrator could observe and resume its runs but neither pause nor stop
 * them, so a superseded overnight run kept working beside its replacement).
 *
 * Scoped to the CALLING thread via the run row's `launchThreadId`, like `status` and `resume` —
 * an unknown id and another thread's run answer identically. The control sequence itself is
 * `controlWorkflowRun` (t3team-workflowRunControl.ts), shared with the HTTP control route.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  controlWorkflowRun,
  type WorkflowRunControlDeps,
  type WorkflowRunControlStatus,
} from "./t3team-workflowRunControl.ts";

/** The agent-side subset: `resume` stays with `t3team.orchestration.resume` (journal semantics). */
export type WorkflowControlToolAction = "pause" | "stop";

export interface ControlWorkflowHandlerArgs {
  readonly runId?: string | undefined;
}

export interface WorkflowControlToolValue {
  readonly ok: true;
  readonly runId: string;
  readonly status: WorkflowRunControlStatus;
  readonly hint: string;
}

export type T3TeamWorkflowControlToolHandlers = {
  readonly controlWorkflowRun: (
    action: WorkflowControlToolAction,
    args: ControlWorkflowHandlerArgs,
  ) => Effect.Effect<WorkflowControlToolValue, string>;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const notFoundHint = (runId: string) =>
  `No orchestration run found for runId '${runId}'. Use t3team.orchestration.status to list your ` +
  "recent runs.";

const hintFor = (action: WorkflowControlToolAction): string =>
  action === "pause"
    ? "Paused at its current waiting point; its continuation is kept. Resume it with " +
      "t3team.orchestration.resume (same runId) or the card's Resume button."
    : "Stopped: child agent turns were interrupted and no further steps will run. Launch again " +
      "with t3team.orchestration.run if the work is still needed.";

/** Build the per-thread pause/stop handler factory. */
export function makeWorkflowControlToolHandlers(
  deps: Omit<WorkflowRunControlDeps, "nowIso" | "stopOrigin">,
): (threadId: ThreadId) => T3TeamWorkflowControlToolHandlers {
  const control: WorkflowRunControlDeps = {
    ...deps,
    nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
    // The agent is automation, not the user: a stop it issues must not be stamped as a user stop.
    stopOrigin: "system",
  };
  return (threadId) => ({
    controlWorkflowRun: (action, args) =>
      Effect.gen(function* () {
        const runId = args.runId?.trim() ?? "";
        if (runId.length === 0) {
          return yield* Effect.fail(`t3team.orchestration.${action} requires a runId.`);
        }
        const found = yield* deps.repo.getById({ runId }).pipe(Effect.mapError(errorMessage));
        if (Option.isNone(found) || found.value.launchThreadId !== String(threadId)) {
          return yield* Effect.fail(notFoundHint(runId));
        }
        const { status } = yield* controlWorkflowRun(control, found.value, {
          threadId: String(threadId),
          action,
        });
        return { ok: true as const, runId, status, hint: hintFor(action) };
      }),
  });
}
