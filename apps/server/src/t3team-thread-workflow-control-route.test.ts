import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { resumeFailedWorkflowRunControlAction } from "./t3team-thread-workflow-control-route-retry.ts";
import { workflowControlValidationError } from "./t3team-thread-workflow-control-route.ts";
import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";

describe("workflow control route validation", () => {
  const run = (status: string, launchThreadId: string | null = "thread-1") => ({
    status,
    launchThreadId,
  });

  it("does not expose a run through another thread", () => {
    expect(
      workflowControlValidationError(run("sleeping"), {
        threadId: "thread-other",
        action: "pause",
      }),
    ).toBe("Workflow run not found for this thread.");
  });

  it("allows pause only at parked boundaries and resume only from paused", () => {
    expect(
      workflowControlValidationError(run("running"), { threadId: "thread-1", action: "pause" }),
    ).toContain("only while");
    expect(
      workflowControlValidationError(run("sleeping"), { threadId: "thread-1", action: "pause" }),
    ).toBeNull();
    expect(
      workflowControlValidationError(run("suspended"), { threadId: "thread-1", action: "pause" }),
    ).toBeNull();
    expect(
      workflowControlValidationError(run("paused"), { threadId: "thread-1", action: "resume" }),
    ).toBeNull();
  });

  it("allows resume for a failed run too, mirroring t3team.orchestration.resume's failed-run branch (GHE #344)", () => {
    expect(
      workflowControlValidationError(run("failed"), { threadId: "thread-1", action: "resume" }),
    ).toBeNull();
    expect(
      workflowControlValidationError(run("completed"), { threadId: "thread-1", action: "resume" }),
    ).toBe("This workflow is not paused or failed.");
  });

  it("allows stop for live runs but not terminal history", () => {
    expect(
      workflowControlValidationError(run("running"), { threadId: "thread-1", action: "stop" }),
    ).toBeNull();
    expect(
      workflowControlValidationError(run("cancelled"), { threadId: "thread-1", action: "stop" }),
    ).toContain("finished");
  });
});

describe("resumeFailedWorkflowRunControlAction (GHE #344)", () => {
  const run: WorkflowRun = {
    runId: "run-1",
    workflowPath: "/workspace/.t3team-runs/run-1/workflow.ts",
    args: {},
    argsHash: "hash",
    launchThreadId: "thread-1",
    projectId: "proj-1" as WorkflowRun["projectId"],
    modelSelection: {} as WorkflowRun["modelSelection"],
    runtimeMode: "full-access" as WorkflowRun["runtimeMode"],
    interactionMode: "default" as WorkflowRun["interactionMode"],
    status: "failed",
    origin: "recipe" as WorkflowRun["origin"],
    recipePath: null,
    pendingThreadId: null,
    pendingCorrelationId: null,
    pendingKind: null,
    wakeAt: null,
    createdAt: "2026-07-17T10:00:00.000Z",
    updatedAt: "2026-07-17T10:00:00.000Z",
  };

  it("fails without dispatching a re-drive when the run has no journal", async () => {
    const dispatchCalls: unknown[] = [];
    const result = await Effect.runPromiseExit(
      resumeFailedWorkflowRunControlAction(
        {
          run,
          threadId: "thread-1",
          repo: {} as never,
          registry: {} as never,
          scheduler: { rearm: async () => {} } as never,
          orchestration: {
            dispatch: (command: unknown) => {
              dispatchCalls.push(command);
              return Effect.succeed({ sequence: 0 });
            },
          } as never,
          journalStore: { hasRun: async () => false } as never,
          fileSystem: {} as never,
          path: {} as never,
          projectionSnapshotQuery: {} as never,
        },
        "run-1",
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(dispatchCalls).toEqual([]);
    if (result._tag === "Failure") {
      const message = JSON.stringify(result.cause);
      expect(message).toContain("no journal to resume from");
    }
  });
});
