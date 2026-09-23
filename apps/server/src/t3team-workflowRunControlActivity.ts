/**
 * The run-level "Workflow paused / resumed / stopped" card-banner activity that
 * `controlWorkflowRun` emits on every control action — split from
 * t3team-workflowRunControl.ts for the additive size budget. What the card's banner reads
 * ("Workflow paused" + when); the agent's tool emits it exactly as the card's button does.
 */
import { CommandId, EventId, ThreadId, type OrchestrationCommand } from "@t3tools/contracts";
import { PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";

import type { OrchestrationDispatchError } from "./orchestration/Errors.ts";

export type WorkflowRunControlPhase = "started" | "paused" | "cancelled";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const postWorkflowRunControlActivity = Effect.fn("postWorkflowRunControlActivity")(
  function* (input: {
    readonly dispatch: (command: OrchestrationCommand) => Effect.Effect<unknown, OrchestrationDispatchError>;
    readonly runId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly phase: WorkflowRunControlPhase;
    readonly nowIso: () => string;
  }) {
    const { dispatch, runId, threadId, projectId, phase, nowIso } = input;
    yield* dispatch({
      type: "thread.activity.append",
      commandId: CommandId.make(`t3team-wf-control:${runId}:${nowIso()}`),
      threadId: ThreadId.make(threadId),
      activity: {
        id: EventId.make(`t3team-wf-step:${runId}:run`),
        tone: "info",
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
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
        turnId: null,
        createdAt: nowIso(),
      },
      createdAt: nowIso(),
    }).pipe(Effect.mapError(errorMessage));
  },
);
