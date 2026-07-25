/**
 * Live workflow-step activity emission (UX slice 1 — "no black box"). Turns each primitive the
 * broker fires into a `thread.activity.append` on the LAUNCH thread, kind
 * `t3work.recipe.workflow.step`, so the web timeline can overlay live step status on the plan
 * (shape) card. The projector and client reducer both upsert activities BY ID, so re-emitting
 * the same id with a later phase replaces the step in place, live.
 *
 * Id scheme: `t3work-wf-step:<correlationId>` — the SDK's correlationId is `<runId>:<seq>`
 * (journal seq), so it is unique per primitive, stable across restarts (a rehydrated run's
 * resolve re-emits onto the SAME activity), and its numeric seq suffix gives the client a
 * deterministic step order. The run-level terminal activity uses `t3work-wf-step:<runId>:run`.
 *
 * Emission is strictly best-effort: every dispatch failure is swallowed (the run must never
 * fail because a status pip could not be drawn), mirroring the broker's one-way delivery.
 */

import { CommandId, EventId, type OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ProjectRecipeWorkflowStepActivityPayload,
  type ProjectRecipeWorkflowStepPhase,
} from "@t3tools/project-recipes";

export interface WorkflowStepSentInput {
  readonly correlationId: string;
  /** The primitive kind (`thread.turn`, `user.input`, `wait.until`, ...). */
  readonly stepKind: string;
  readonly phase: ProjectRecipeWorkflowStepPhase;
  /** Human label — tool refId / prompt or question snippet / wake time. */
  readonly detail?: string;
  /** Human-readable terminal error, shown only in the expandable work log. */
  readonly error?: string;
  /** Thread this primitive operates on; lets the plan card navigate to child work. */
  readonly threadId?: string;
}

export interface WorkflowStepActivityEmitter {
  /** Emit the step's initial activity when the broker fires its primitive. */
  readonly emitSent: (input: WorkflowStepSentInput) => Promise<void>;
  /** Re-emit the SAME activity id with a terminal phase when the ask/sleep resolves. */
  readonly emitResolved: (
    correlationId: string,
    phase: "completed" | "failed",
    error?: string,
  ) => Promise<void>;
  /** Emit the run-level terminal activity (stepId `run:<runId>`). */
  readonly emitRun: (phase: "completed" | "failed", error?: string) => Promise<void>;
  /**
   * `<stepKind>` (plus its human label) of the most recent step that was SENT and never
   * resolved — the primitive in flight. Used to say WHERE a run failed. `undefined` after a
   * restart (the map is process-local) or when nothing is outstanding; optional so existing
   * emitter stand-ins keep type-checking.
   */
  readonly describePendingStep?: () => string | undefined;
}

/** Trim a prompt/question to a one-line human label. */
export function workflowStepDetailSnippet(text: string, max = 96): string {
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

interface SentStepRecord {
  readonly stepKind: string;
  readonly detail: string | undefined;
  readonly createdAt: string;
  readonly threadId: string | undefined;
}

export function createWorkflowStepActivityEmitter(opts: {
  readonly runId: string;
  readonly projectId: string;
  /** Activities land on the launch thread; a headless run (undefined) emits nothing. */
  readonly launchThreadId: string | undefined;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
}): WorkflowStepActivityEmitter {
  // Remembers each sent step so its resolution re-emits with the SAME label + createdAt (the
  // upsert replaces the activity — keeping createdAt pins the step's timeline slot). Empty
  // after a restart; a post-rehydration resolve then degrades to a fresh generic entry.
  const sentByCorrelation = new Map<string, SentStepRecord>();

  const append = (
    stepId: string,
    payload: ProjectRecipeWorkflowStepActivityPayload,
    summary: string,
    createdAt: string,
  ): Promise<void> => {
    if (opts.launchThreadId === undefined) return Promise.resolve();
    return opts
      .dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(`t3work-wf-step:${opts.newId()}`),
        threadId: ThreadId.make(opts.launchThreadId),
        activity: {
          id: EventId.make(`t3work-wf-step:${stepId}`),
          tone: payload.phase === "failed" ? "error" : "info",
          kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
          summary,
          payload,
          turnId: null,
          createdAt,
        },
        createdAt: opts.nowIso(),
      })
      .catch(() => {}); // best-effort: a lost status pip must never fail the run
  };

  return {
    emitSent: (input) => {
      const createdAt = opts.nowIso();
      sentByCorrelation.set(input.correlationId, {
        stepKind: input.stepKind,
        detail: input.detail,
        createdAt,
        threadId: input.threadId,
      });
      return append(
        input.correlationId,
        {
          workflowRunId: opts.runId,
          stepId: input.correlationId,
          stepKind: input.stepKind,
          phase: input.phase,
          ...(input.detail === undefined ? {} : { detail: input.detail }),
          ...(input.error === undefined ? {} : { error: input.error }),
          projectId: opts.projectId,
          ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
        },
        input.detail ?? "Workflow activity",
        createdAt,
      );
    },
    emitResolved: (correlationId, phase, error) => {
      const sent = sentByCorrelation.get(correlationId);
      sentByCorrelation.delete(correlationId);
      return append(
        correlationId,
        {
          workflowRunId: opts.runId,
          stepId: correlationId,
          stepKind: sent?.stepKind ?? "step",
          phase,
          ...(sent?.detail === undefined ? {} : { detail: sent.detail }),
          ...(error === undefined ? {} : { error }),
          projectId: opts.projectId,
          ...(sent?.threadId === undefined ? {} : { threadId: sent.threadId }),
        },
        `Workflow step ${phase}: ${sent?.detail ?? sent?.stepKind ?? correlationId}`,
        sent?.createdAt ?? opts.nowIso(),
      );
    },
    describePendingStep: () => {
      // Insertion order == send order, so the last entry is the primitive still in flight.
      const outstanding = [...sentByCorrelation.values()].at(-1);
      if (outstanding === undefined) return undefined;
      return outstanding.detail === undefined
        ? outstanding.stepKind
        : `${outstanding.stepKind} (${outstanding.detail})`;
    },
    emitRun: (phase, error) =>
      append(
        `${opts.runId}:run`,
        {
          workflowRunId: opts.runId,
          stepId: `run:${opts.runId}`,
          stepKind: "run",
          phase,
          projectId: opts.projectId,
          ...(error === undefined ? {} : { error }),
        },
        phase === "completed" ? "Workflow run completed" : "Workflow run failed",
        opts.nowIso(),
      ),
  };
}
