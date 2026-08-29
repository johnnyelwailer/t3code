/**
 * Live workflow-step progress derivation (recipe UX "no black box" slice). Groups the
 * `t3team.recipe.workflow.step` thread activities the broker emits (see
 * apps/server/src/t3team-workflowEngineStepActivities.ts) into per-run step lists the
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

import { compareT3TeamActivitiesByOrder } from "~/t3team/chat/t3team-threadRecipeActivityCards";

export interface T3TeamWorkflowStepEntry {
  readonly stepId: string;
  /** Numeric journal seq parsed from `<runId>:<seq>`; null when the suffix is non-numeric. */
  readonly seq: number | null;
  readonly stepKind: string;
  readonly phase: ProjectRecipeWorkflowStepPhase;
  /** Timestamp of the latest activity update for human waiting/elapsed copy. */
  readonly updatedAt?: string;
  readonly detail?: string;
  readonly error?: string;
  readonly projectId?: string;
  readonly threadId?: string;
  /** The authored `phase()` group active when this step was sent, stamped by the server — see
   * `reconcileT3TeamWorkflowShapeProgress`. Absent for older runs / activities. */
  readonly workflowPhase?: string;
  /** Milliseconds the step took to resolve, stamped by the server only on its terminal
   * (completed/failed) activity. Absent for a still-running step, for a post-restart resolve
   * (the server has no remembered start time), and for older activities — see
   * `ProjectRecipeWorkflowStepActivityPayload.durationMs`. */
  readonly durationMs?: number;
  /** Client-side aggregate, never stamped by the server: how many `thread.turn` activities were
   * folded into this row because they ran on the SAME child thread, adjacent, with the same
   * displayed label — see `t3team-workflowShapeThreadTurnFold.ts`. Absent for a step that was not
   * folded, including a genuinely single-turn step. */
  readonly turnCount?: number;
}

export interface T3TeamWorkflowRunProgress {
  readonly runId: string;
  /** Executed step entries in journal-seq order (run-level entry excluded). */
  readonly steps: ReadonlyArray<T3TeamWorkflowStepEntry>;
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
  stepsById: Map<string, T3TeamWorkflowStepEntry>;
  run: { phase: ProjectRecipeWorkflowStepPhase; error?: string } | null;
}

/** Derive per-run live step progress from a thread's activities. */
export function deriveT3TeamWorkflowStepRuns(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyMap<string, T3TeamWorkflowRunProgress> {
  const runs = new Map<string, MutableRunProgress>();

  for (const activity of [...activities].toSorted(compareT3TeamActivitiesByOrder)) {
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
      ...(activity.createdAt === undefined ? {} : { updatedAt: activity.createdAt }),
      ...(payload.detail === undefined ? {} : { detail: payload.detail }),
      ...(payload.error === undefined ? {} : { error: payload.error }),
      ...(payload.projectId === undefined ? {} : { projectId: payload.projectId }),
      ...(payload.threadId === undefined ? {} : { threadId: payload.threadId }),
      ...(payload.workflowPhase === undefined ? {} : { workflowPhase: payload.workflowPhase }),
      ...(payload.durationMs === undefined ? {} : { durationMs: payload.durationMs }),
    });
  }

  const result = new Map<string, T3TeamWorkflowRunProgress>();
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
