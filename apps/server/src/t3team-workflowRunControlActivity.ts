/**
 * The run-level "Workflow paused / resumed / stopped" card-banner activity that
 * `controlWorkflowRun` emits on every control action — split from
 * t3team-workflowRunControl.ts for the additive size budget. What the card's banner reads
 * ("Workflow paused" + when); the agent's tool emits it exactly as the card's button does.
 */
import { PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";

import { workflowStepActivityId } from "./t3team-workflowEngineStepActivities.ts";
import type { T3TeamWorkflowHostShape } from "./t3team-workflowHost.ts";

export type WorkflowRunControlPhase = "started" | "paused" | "cancelled";

export const postWorkflowRunControlActivity = Effect.fn("postWorkflowRunControlActivity")(
  function* (input: {
    readonly host: Pick<T3TeamWorkflowHostShape, "upsertActivity">;
    readonly runId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly phase: WorkflowRunControlPhase;
  }) {
    const { host, runId, threadId, projectId, phase } = input;
    yield* host
      .upsertActivity({
        threadId,
        id: workflowStepActivityId(`${runId}:run`),
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        tone: "info",
        summary:
          phase === "paused"
            ? "Workflow paused"
            : phase === "cancelled"
              ? "Workflow stopped"
              : "Workflow resumed",
        payload: {
          workflowRunId: runId,
          stepId: `run:${runId}`,
          stepKind: "run",
          phase,
          projectId,
        },
      })
      .pipe(Effect.mapError((error) => error.message));
  },
);
