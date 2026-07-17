/**
 * Live workflow-step progress derivation (recipe UX "no black box" slice). Groups the
 * `t3work.recipe.workflow.step` thread activities the broker emits (see
 * apps/server/src/t3work-workflowEngineStepActivities.ts) into per-run step lists the
 * plan-card overlay renders:
 *   • one entry per stepId, LATEST phase wins (the server re-emits the same activity id
 *     with a terminal phase; the client reducer upserts by id, but this derivation is
 *     also idempotent over duplicates);
 *   • ordered by the numeric journal seq embedded in the stepId (`<runId>:<seq>`);
 *   • the run-level terminal activity (stepId `run:<runId>`) is split out as the
 *     overall run status, not a step row.
 */
import type { OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  isProjectRecipeWorkflowStepActivityPayload,
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ProjectRecipeWorkflowStepPhase,
} from "@t3tools/project-recipes";

import { compareT3workActivitiesByOrder } from "~/t3work/chat/t3work-threadRecipeActivityCards";

export interface T3workWorkflowStepEntry {
  readonly stepId: string;
  /** Numeric journal seq parsed from `<runId>:<seq>`; null when the suffix is non-numeric. */
  readonly seq: number | null;
  readonly stepKind: string;
  readonly phase: ProjectRecipeWorkflowStepPhase;
  readonly detail?: string;
  readonly error?: string;
}

export interface T3workWorkflowRunProgress {
  readonly runId: string;
  /** Executed step entries in journal-seq order (run-level entry excluded). */
  readonly steps: ReadonlyArray<T3workWorkflowStepEntry>;
  /** The run-level terminal status (stepId `run:<runId>`), when emitted. */
  readonly run: { readonly phase: ProjectRecipeWorkflowStepPhase; readonly error?: string } | null;
}

/** Parse the numeric journal seq from a stepId of the form `<runId>:<seq>`. */
function parseStepSeq(stepId: string): number | null {
  const suffix = stepId.slice(stepId.lastIndexOf(":") + 1);
  if (suffix.length === 0 || !/^\d+$/.test(suffix)) {
    return null;
  }
  return Number(suffix);
}

interface MutableRunProgress {
  runId: string;
  stepsById: Map<string, T3workWorkflowStepEntry>;
  run: { phase: ProjectRecipeWorkflowStepPhase; error?: string } | null;
}

/** Derive per-run live step progress from a thread's activities. */
export function deriveT3workWorkflowStepRuns(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyMap<string, T3workWorkflowRunProgress> {
  const runs = new Map<string, MutableRunProgress>();

  for (const activity of [...activities].toSorted(compareT3workActivitiesByOrder)) {
    if (activity.kind !== PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP) {
      continue;
    }
    if (!isProjectRecipeWorkflowStepActivityPayload(activity.payload)) {
      continue;
    }
    const payload = activity.payload;
    let run = runs.get(payload.workflowRunId);
    if (run === undefined) {
      run = { runId: payload.workflowRunId, stepsById: new Map(), run: null };
      runs.set(payload.workflowRunId, run);
    }

    if (payload.stepId === `run:${payload.workflowRunId}`) {
      // Run-level terminal activity — later emissions win.
      run.run = {
        phase: payload.phase,
        ...(payload.error === undefined ? {} : { error: payload.error }),
      };
      continue;
    }

    // Latest phase wins per stepId (upsert semantics mirror the server/client reducers).
    run.stepsById.set(payload.stepId, {
      stepId: payload.stepId,
      seq: parseStepSeq(payload.stepId),
      stepKind: payload.stepKind,
      phase: payload.phase,
      ...(payload.detail === undefined ? {} : { detail: payload.detail }),
      ...(payload.error === undefined ? {} : { error: payload.error }),
    });
  }

  const result = new Map<string, T3workWorkflowRunProgress>();
  for (const [runId, run] of runs) {
    const steps = [...run.stepsById.values()].toSorted((left, right) => {
      if (left.seq !== null && right.seq !== null && left.seq !== right.seq) {
        return left.seq - right.seq;
      }
      if (left.seq === null && right.seq !== null) return 1;
      if (left.seq !== null && right.seq === null) return -1;
      return 0; // stable: keep first-seen order for equal/unparseable seqs
    });
    result.set(runId, { runId, steps, run: run.run });
  }
  return result;
}
