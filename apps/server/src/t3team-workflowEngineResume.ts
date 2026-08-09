/**
 * The per-run `resume` closure, split out of `t3team-workflowEngineLaunch.ts` to keep each module
 * focused and under the prefixed-file LOC cap.
 *
 * `resume` re-enters `resumeWorkflow` after journaling the reply. It is driven by BOTH the reactor
 * (ask replies) and the scheduler (clock parks), so it must be safe under concurrent/duplicate
 * ticks (Epic 27 hot-loop hardening):
 *   • An in-flight resume owns the journal write; a concurrent caller returns without re-driving,
 *     so a legitimate mid-settle resume is never double-run nor mistaken for a crashed park.
 *   • A `wrote:false` with NO in-flight resume means a prior process journaled the reply then died
 *     before settling — the run row is stuck `sleeping`. `orphanIfSleeping` fails it so the
 *     scheduler stops re-arming it forever (a late/duplicate reply on an already-advanced run is a
 *     no-op there, guarded by status + correlation).
 */

import { appendResolvedEntry, resumeWorkflow, type WorkflowRef } from "@t3team/sdk";

import { settleWorkflowRunFailure } from "./t3team-workflowRunFailure.ts";

import type {
  LaunchWorkflowRecipeInput,
  WorkflowRunController,
} from "./t3team-workflowEngineLaunch.ts";
import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import { tryWorkflowRepair } from "./t3team-workflowEngineRepair.ts";

/**
 * The per-run `fail` closure: a HOST-detected terminal failure for a run whose ask can never be
 * answered (an agent turn that ended without a word of reply text — see
 * `WorkflowRegisteredRun.fail`). The body cannot observe that condition, so the reactor reports it
 * here, through the SAME funnel a thrown body error takes: the launching conversation is told, the
 * durable row records the reason, and the step strip flips to failed. No repair attempt — nothing
 * about the body is broken, so re-running it would only reproduce the silence.
 */
export function makeControllerFail(deps: {
  readonly input: LaunchWorkflowRecipeInput;
  readonly stepActivities: WorkflowStepActivityEmitter;
  readonly isCancelled: () => boolean;
}): (error: unknown) => Promise<void> {
  const { input } = deps;
  return async (error) => {
    if (deps.isCancelled()) return;
    if (input.registry.getRun(input.runId) === undefined) return;
    await settleWorkflowRunFailure({
      runId: input.runId,
      launchThreadId: input.launchThreadId,
      error,
      registry: input.registry,
      lifecycle: input.lifecycle,
      stepActivities: deps.stepActivities,
      dispatch: input.dispatch,
      newId: input.newId,
      nowIso: input.nowIso,
      onError: input.onError,
      phase: "resume",
    });
  };
}

export function makeControllerResume(deps: {
  readonly input: LaunchWorkflowRecipeInput;
  readonly ref: WorkflowRef;
  readonly options: WorkflowRunController["options"];
  readonly settle: WorkflowRunController["settle"];
  readonly stepActivities: WorkflowStepActivityEmitter;
  readonly isCancelled?: WorkflowRunController["isCancelled"];
  readonly appendResolved?: typeof appendResolvedEntry;
  readonly repair?: typeof tryWorkflowRepair;
}): (correlationId: string, reply: unknown) => Promise<void> {
  const { input, ref, options, settle, stepActivities } = deps;
  const appendReply = deps.appendResolved ?? appendResolvedEntry;
  const repair = deps.repair ?? tryWorkflowRepair;
  let resuming = false;
  return async (correlationId, reply) => {
    if (input.registry.getRun(input.runId) === undefined) return;
    if (resuming) return; // a concurrent resume is settling — don't double-drive or orphan
    resuming = true;
    try {
      // Claim capacity/state before consuming the durable reply. If Pause/Stop wins while this
      // wake is queued, recordActive returns false and the unresolved continuation stays intact.
      if ((await input.lifecycle?.recordActive()) === false) return;
      const wrote = await appendReply({
        ...(input.store === undefined ? {} : { store: input.store }),
        runsRoot: input.runsRoot,
        runId: input.runId,
        correlationId,
        reply,
      });
      if (!wrote) {
        await input.lifecycle?.orphanIfSleeping(correlationId);
        return;
      }
      // The awaited primitive resolved — flip its live step activity to `completed` (same id →
      // in-place upsert) before the replay drives to the next suspension.
      await stepActivities.emitResolved(correlationId, "completed");
      await settle(await resumeWorkflow(input.runId, ref, input.args, options));
    } catch (error) {
      if (input.registry.getRun(input.runId) === undefined) return;
      // A replay can fail long after launch (for example after a timer, user decision, or child
      // reply). Ephemeral workflows must use the same bounded repair funnel at every execution
      // boundary, not only during their first synchronous start.
      const repaired = await repair(
        input,
        {
          ref,
          options,
          settle,
          stepActivities,
          isCancelled: deps.isCancelled ?? (() => false),
          resume: async () => {},
        },
        error,
      ).catch(() => false);
      if (repaired) return;
      // Mirror the launch path's post-repair cancellation guard: a user Stop
      // during the (long) repair await must not overwrite the stopped state or
      // post a spurious failure notice for a deliberately cancelled run.
      if (deps.isCancelled?.() ?? false) return;
      // The run may have completed DURING repair (settle deletes it from the
      // registry and posts the completion) with only post-completion bookkeeping
      // failing afterwards — never overwrite that completion with a failure.
      if (input.registry.getRun(input.runId) === undefined) return;
      await settleWorkflowRunFailure({
        runId: input.runId,
        launchThreadId: input.launchThreadId,
        error,
        registry: input.registry,
        lifecycle: input.lifecycle,
        stepActivities,
        dispatch: input.dispatch,
        newId: input.newId,
        nowIso: input.nowIso,
        onError: input.onError,
        phase: "resume",
      });
    } finally {
      resuming = false;
    }
  };
}
