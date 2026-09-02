import { describe, expect, it } from "vite-plus/test";

import { workflowControlValidationError } from "./t3team-thread-workflow-control-route.ts";

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
