/**
 * `deriveT3TeamWorkflowStepRuns` carries `durationMs` through from the step activity payload
 * untouched — the server (`t3team-workflowEngineStepActivities.ts`) is the one deciding whether
 * a duration exists at all (see `ProjectRecipeWorkflowStepActivityPayload.durationMs`); this
 * derivation just needs to not drop it, and to not invent one when the payload has none.
 */
import { EventId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  type ProjectRecipeWorkflowStepActivityPayload,
} from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { deriveT3TeamWorkflowStepRuns } from "~/t3team/chat/t3team-threadWorkflowStepProgress";

const RUN_ID = "run-1";

function stepActivity(
  payload: ProjectRecipeWorkflowStepActivityPayload,
): OrchestrationThreadActivity {
  return {
    id: EventId.make(`t3team-wf-step:${payload.stepId}`),
    tone: payload.phase === "failed" ? "error" : "info",
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: `Workflow step ${payload.phase}: ${payload.detail ?? payload.stepKind}`,
    payload,
    turnId: null,
    createdAt: "2026-07-17T10:00:00.000Z",
  };
}

describe("deriveT3TeamWorkflowStepRuns — durationMs", () => {
  it("carries durationMs through from a resolved step's payload", () => {
    const runs = deriveT3TeamWorkflowStepRuns([
      stepActivity({
        workflowRunId: RUN_ID,
        stepId: `${RUN_ID}:1`,
        stepKind: "thread.turn",
        phase: "completed",
        durationMs: 4_200,
      }),
    ]);

    expect(runs.get(RUN_ID)?.steps[0]?.durationMs).toBe(4_200);
  });

  it("leaves durationMs undefined for a payload that never carried one (post-restart resolve)", () => {
    const runs = deriveT3TeamWorkflowStepRuns([
      stepActivity({
        workflowRunId: RUN_ID,
        stepId: `${RUN_ID}:1`,
        stepKind: "thread.turn",
        phase: "completed",
      }),
    ]);

    expect(runs.get(RUN_ID)?.steps[0]?.durationMs).toBeUndefined();
  });
});
