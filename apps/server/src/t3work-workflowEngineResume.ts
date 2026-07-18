/**
 * The per-run `resume` closure, split out of `t3work-workflowEngineLaunch.ts` to keep each module
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

import { appendResolvedEntry, resumeWorkflow, type WorkflowRef } from "@t3work/sdk";

import type {
  LaunchWorkflowRecipeInput,
  WorkflowRunController,
} from "./t3work-workflowEngineLaunch.ts";
import type { WorkflowStepActivityEmitter } from "./t3work-workflowEngineStepActivities.ts";

export function makeControllerResume(deps: {
  readonly input: LaunchWorkflowRecipeInput;
  readonly ref: WorkflowRef;
  readonly options: WorkflowRunController["options"];
  readonly settle: WorkflowRunController["settle"];
  readonly stepActivities: WorkflowStepActivityEmitter;
}): (correlationId: string, reply: unknown) => Promise<void> {
  const { input, ref, options, settle, stepActivities } = deps;
  let resuming = false;
  return async (correlationId, reply) => {
    if (resuming) return; // a concurrent resume is settling — don't double-drive or orphan
    resuming = true;
    try {
      const wrote = await appendResolvedEntry({
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
      input.registry.deleteRun(input.runId);
      await input.lifecycle?.recordFailed();
      await stepActivities.emitRun(
        "failed",
        error instanceof Error ? error.message : String(error),
      );
      await input.onError?.(error);
    } finally {
      resuming = false;
    }
  };
}
