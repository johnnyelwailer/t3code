import type { T3TeamThreadFacts } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveThreadStatusPill } from "~/components/Sidebar.logic";
import {
  resolveT3TeamWorkflowRunLiveness,
  withT3TeamWorkflowRunStatus,
} from "./t3team-workflowRunLiveness";

type RunStatus = NonNullable<T3TeamThreadFacts["workflowRunStatus"]>;

const run = (
  status: RunStatus["status"],
  pendingKind: RunStatus["pendingKind"] = null,
): Pick<T3TeamThreadFacts, "workflowRunStatus"> => ({
  workflowRunStatus: {
    runId: "run-1",
    status,
    pendingKind,
    wakeAt: null,
    updatedAt: "2026-10-01T10:00:00.000Z",
  },
});

describe("resolveT3TeamWorkflowRunLiveness", () => {
  it("reads an engine-driven run as working and a parked one as waiting", () => {
    expect(resolveT3TeamWorkflowRunLiveness(run("running"))).toBe("working");
    expect(resolveT3TeamWorkflowRunLiveness(run("queued"))).toBe("working");
    expect(resolveT3TeamWorkflowRunLiveness(run("suspended", "thread.turn"))).toBe("working");
    expect(resolveT3TeamWorkflowRunLiveness(run("sleeping"))).toBe("waiting");
    expect(resolveT3TeamWorkflowRunLiveness(run("suspended", "signal.wait"))).toBe("waiting");
  });

  it("hands an askUser park to the user", () => {
    expect(resolveT3TeamWorkflowRunLiveness(run("suspended", "user.input"))).toBe("input");
  });

  it("treats terminal and paused runs as inert, unless another run still sleeps", () => {
    expect(resolveT3TeamWorkflowRunLiveness(run("completed"))).toBeNull();
    expect(resolveT3TeamWorkflowRunLiveness(run("paused"))).toBeNull();
    expect(resolveT3TeamWorkflowRunLiveness(undefined)).toBeNull();
    expect(
      resolveT3TeamWorkflowRunLiveness({
        ...run("failed"),
        sleepingUntil: "2026-10-02T09:00:00.000Z",
      }),
    ).toBe("waiting");
  });
});

describe("withT3TeamWorkflowRunStatus", () => {
  it("keeps attention states and the thread's own work", () => {
    expect(withT3TeamWorkflowRunStatus("approval", "working")).toBe("approval");
    expect(withT3TeamWorkflowRunStatus("working", "input")).toBe("working");
  });

  it("lets a live run outrank an idle or finished launch thread", () => {
    expect(withT3TeamWorkflowRunStatus("ready", "working")).toBe("working");
    expect(withT3TeamWorkflowRunStatus("failed", "input")).toBe("input");
    expect(withT3TeamWorkflowRunStatus("ready", "waiting")).toBe("waiting");
    expect(withT3TeamWorkflowRunStatus("failed", "waiting")).toBe("failed");
    expect(withT3TeamWorkflowRunStatus("ready", null)).toBe("ready");
  });
});

describe("resolveThreadStatusPill with a workflow run", () => {
  const idleThread = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default" as const,
    latestRun: null,
    runtime: null,
  };

  it("shows the run's liveness on an idle launch thread", () => {
    const pill = (workflowRunLiveness: "input" | "working" | "waiting") =>
      resolveThreadStatusPill({ thread: { ...idleThread, workflowRunLiveness } })?.label;
    expect(pill("input")).toBe("Awaiting Input");
    expect(pill("working")).toBe("Working");
    expect(pill("waiting")).toBe("Waiting");
    expect(resolveThreadStatusPill({ thread: idleThread })).toBeNull();
  });
});
