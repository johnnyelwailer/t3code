import {
  EnvironmentId,
  ProjectId,
  readThreadHandoffLink,
  RunId,
  T3TEAM_THREAD_HANDOFF_FACT_KEY,
  type T3TeamThreadHandoffCapture,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  continuationEnvelope,
  runThreadHandoff,
  successorRunState,
  successorWorkspace,
  type ThreadHandoffSteps,
} from "./t3team-threadHandoff.ts";

const source = {
  environmentId: EnvironmentId.make("env-local"),
  threadId: ThreadId.make("thread-source"),
  label: "This device",
};
const successor = {
  environmentId: EnvironmentId.make("env-cloud"),
  threadId: ThreadId.make("thread-successor"),
  label: "nexi-cloud-1",
};

const capture = (
  overrides: Partial<T3TeamThreadHandoffCapture> = {},
): T3TeamThreadHandoffCapture => ({
  threadId: source.threadId,
  projectId: ProjectId.make("project-x"),
  title: "Upload retries",
  branch: "feature/upload-retry",
  worktreePath: "/repo/.worktrees/upload-retry",
  activeRunId: RunId.make("run-active"),
  summaryText: "Provider context handoff. Thread: thread-source.\n[Historical user] Add a retry",
  branchState: {
    upstream: "origin/feature/upload-retry",
    unpushedCommits: 0,
    uncommittedChanges: false,
  },
  refusals: [],
  capturedAt: "2026-10-13T00:00:00.000Z",
  ...overrides,
});

/** Steps that log every call in order; `fail` makes one step reject. */
function recordingSteps(input: {
  readonly capture?: T3TeamThreadHandoffCapture;
  readonly fail?: "capture" | "launch" | "verify" | "interrupt" | "record";
  readonly stopFails?: boolean;
  readonly noStop?: boolean;
}) {
  const calls: string[] = [];
  const launched: Array<{ readonly text: string; readonly workspace: unknown }> = [];
  const step = (name: string) => async () => {
    calls.push(name);
    if (input.fail === name) throw new Error(`${name} broke`);
  };
  const steps: ThreadHandoffSteps = {
    capture: async ({ waitForTurnEnd }) => {
      calls.push(`capture(wait=${waitForTurnEnd})`);
      if (input.fail === "capture") throw new Error("capture broke");
      return input.capture ?? capture();
    },
    launchSuccessor: async ({ text, workspace }) => {
      launched.push({ text, workspace });
      await step("launch")();
    },
    awaitSuccessorLive: step("verify"),
    interruptSource: async (runId) => {
      calls.push(`interrupt(${runId})`);
      if (input.fail === "interrupt") throw new Error("interrupt broke");
    },
    record: async (environmentId, recordInput) => {
      calls.push(`record(${environmentId}:${recordInput.direction})`);
      if (input.fail === "record") throw new Error("record broke");
    },
    reapSource: step("reap"),
    ...(input.noStop
      ? {}
      : {
          stopSuccessor: async () => {
            calls.push("stopSuccessor");
            if (input.stopFails) throw new Error("stop broke");
            return true;
          },
        }),
  };
  return { steps, calls, launched };
}

const SOURCE_MUTATIONS = /^(interrupt|record|reap)/;

describe("runThreadHandoff — source settles only after the successor is live", () => {
  it("captures, launches, verifies, and only then settles the source", async () => {
    const { steps, calls } = recordingSteps({});
    const outcome = await runThreadHandoff({ source, successor, turnMode: "interrupt", steps });
    expect(outcome).toEqual({ type: "moved", warnings: [] });
    expect(calls).toEqual([
      "capture(wait=false)",
      "launch",
      "verify",
      "interrupt(run-active)",
      "record(env-local:moved_to)",
      "record(env-cloud:moved_from)",
      "reap",
    ]);
  });

  it.each([
    ["launch", { type: "failed", stage: "launch", message: "launch broke" }],
    [
      "verify",
      { type: "failed", stage: "verify", message: "verify broke", successorStopped: true },
    ],
  ] as const)("leaves the source untouched when %s fails", async (stage, expected) => {
    const { steps, calls } = recordingSteps({ fail: stage });
    const outcome = await runThreadHandoff({ source, successor, turnMode: "interrupt", steps });
    expect(outcome).toEqual(expected);
    expect(calls.filter((call) => SOURCE_MUTATIONS.test(call))).toEqual([]);
  });

  it("stops the successor only when verification fails", async () => {
    const moved = recordingSteps({});
    await runThreadHandoff({ source, successor, turnMode: "interrupt", steps: moved.steps });
    expect(moved.calls).not.toContain("stopSuccessor");
    const failed = recordingSteps({ fail: "verify" });
    await runThreadHandoff({ source, successor, turnMode: "interrupt", steps: failed.steps });
    expect(failed.calls).toEqual(["capture(wait=false)", "launch", "verify", "stopSuccessor"]);
  });

  it.each([
    ["the stop throws", { fail: "verify", stopFails: true }],
    ["the host cannot stop it", { fail: "verify", noStop: true }],
  ] as const)("reports a still-starting successor when %s", async (_label, input) => {
    const { steps } = recordingSteps(input);
    const outcome = await runThreadHandoff({ source, successor, turnMode: "interrupt", steps });
    expect(outcome).toMatchObject({ type: "failed", stage: "verify", successorStopped: false });
  });

  it("moves nothing when the capture refuses", async () => {
    const refusals = [{ reason: "unpushed_commits" as const, message: "3 commits are not pushed" }];
    const { steps, calls } = recordingSteps({ capture: capture({ refusals }) });
    const outcome = await runThreadHandoff({ source, successor, turnMode: "interrupt", steps });
    expect(outcome).toEqual({ type: "refused", refusals });
    expect(calls).toEqual(["capture(wait=false)"]);
  });

  it("waits for the turn in 'wait' mode and then has no run to interrupt", async () => {
    const { steps, calls } = recordingSteps({ capture: capture({ activeRunId: null }) });
    await runThreadHandoff({ source, successor, turnMode: "wait", steps });
    expect(calls[0]).toBe("capture(wait=true)");
    expect(calls.some((call) => call.startsWith("interrupt"))).toBe(false);
  });

  it("reports a settle failure as a warning, never as a rollback", async () => {
    const { steps, calls } = recordingSteps({ fail: "interrupt" });
    const outcome = await runThreadHandoff({ source, successor, turnMode: "interrupt", steps });
    expect(outcome).toEqual({
      type: "moved",
      warnings: ["Stopping the original turn: interrupt broke"],
    });
    expect(calls).toContain("record(env-local:moved_to)");
  });

  it("seeds the successor with the summary and its own worktree from the pushed branch", async () => {
    const { steps, launched } = recordingSteps({});
    await runThreadHandoff({ source, successor, turnMode: "interrupt", steps });
    expect(launched[0]?.workspace).toEqual({
      type: "worktree",
      baseBranch: "feature/upload-retry",
      startFromOrigin: true,
    });
    expect(launched[0]?.text).toContain("Context handoff (full_thread_summary):");
    expect(launched[0]?.text).toContain("[Historical user] Add a retry");
    expect(launched[0]?.text).toContain("stopped mid-way");
  });
});

describe("successor helpers", () => {
  it("starts a branchless thread at the project root", () => {
    expect(successorWorkspace({ branch: null })).toEqual({ type: "root" });
  });

  it("tells the successor where the work came from and where to push", () => {
    const text = continuationEnvelope({ capture: capture(), source, interrupted: false });
    expect(text).toContain("moved here from This device");
    expect(text).toContain("git push origin HEAD:feature/upload-retry");
    expect(text).not.toContain("stopped mid-way");
  });

  it("reads the successor's first run state from its shell", () => {
    const shell = (status: string, latestRunId: string | null) =>
      ({ status, latestRunId }) as Parameters<typeof successorRunState>[0];
    expect(successorRunState(undefined)).toBe("pending");
    expect(successorRunState(shell("idle", null))).toBe("pending");
    expect(successorRunState(shell("preparing", "run-1"))).toBe("pending");
    expect(successorRunState(shell("starting", "run-1"))).toBe("pending");
    expect(successorRunState(shell("running", "run-1"))).toBe("live");
    expect(successorRunState(shell("waiting", "run-1"))).toBe("live");
    expect(successorRunState(shell("completed", "run-1"))).toBe("live");
    expect(successorRunState(shell("failed", "run-1"))).toBe("failed");
  });

  it("decodes the recorded link fact and ignores malformed ones", () => {
    const link = {
      direction: "moved_to",
      peerEnvironmentId: "env-cloud",
      peerThreadId: "thread-successor",
      peerLabel: "nexi-cloud-1",
      recordedAt: "2026-10-13T00:00:00.000Z",
    };
    expect(
      readThreadHandoffLink({ extensions: { [T3TEAM_THREAD_HANDOFF_FACT_KEY]: link } })?.peerLabel,
    ).toBe("nexi-cloud-1");
    expect(readThreadHandoffLink({ extensions: { [T3TEAM_THREAD_HANDOFF_FACT_KEY]: 1 } })).toBe(
      null,
    );
    expect(readThreadHandoffLink(undefined)).toBe(null);
  });
});
