import { expect, it } from "vite-plus/test";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import { deriveThreadRunState, deriveThreadRunStatus } from "./t3team-threadRunStatus.ts";

const shellBase = {
  id: ThreadId.make("thread-1"),
  title: "My thread",
  branch: null,
  worktreePath: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T01:00:00.000Z",
  childStatus: null,
  settledOverride: null,
  settledAt: null,
};

it("maps a running session to running", () => {
  expect(deriveThreadRunState({ session: { status: "running" }, latestTurn: null })).toBe(
    "running",
  );
  expect(deriveThreadRunState({ session: { status: "starting" }, latestTurn: null })).toBe(
    "running",
  );
});

it("maps a running latest turn to running even when the session lags", () => {
  expect(
    deriveThreadRunState({ session: { status: "idle" }, latestTurn: { state: "running" } }),
  ).toBe("running");
});

it("maps a cleanly settled turn to completed", () => {
  expect(
    deriveThreadRunState({
      session: { status: "idle" },
      latestTurn: { state: "completed" },
    }),
  ).toBe("completed");
  expect(
    deriveThreadRunState({
      session: { status: "ready" },
      latestTurn: { state: "completed" },
    }),
  ).toBe("completed");
});

it("maps an errored session or turn to failed", () => {
  expect(deriveThreadRunState({ session: { status: "error" }, latestTurn: null })).toBe("failed");
  expect(
    deriveThreadRunState({
      session: { status: "idle" },
      latestTurn: { state: "error" },
    }),
  ).toBe("failed");
});

it("maps an interrupted/stopped turn to aborted", () => {
  expect(
    deriveThreadRunState({
      session: { status: "interrupted" },
      latestTurn: { state: "interrupted" },
    }),
  ).toBe("aborted");
  expect(deriveThreadRunState({ session: { status: "stopped" }, latestTurn: null })).toBe(
    "aborted",
  );
});

it("a failed session outranks a stale running latest turn (dead child reads failed)", () => {
  expect(
    deriveThreadRunState({
      session: { status: "error" },
      latestTurn: { state: "running" },
    }),
  ).toBe("failed");
});

it("a live background fleet reads as running when the turn has settled", () => {
  expect(
    deriveThreadRunState({
      session: { status: "idle" },
      latestTurn: { state: "completed" },
      backgroundLiveness: "working",
    }),
  ).toBe("running");
});

it("no turn signal at all reads idle", () => {
  expect(deriveThreadRunState({ session: null, latestTurn: null })).toBe("idle");
});

it("derives the full status record from a shell", () => {
  const status = deriveThreadRunStatus({
    ...shellBase,
    modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
    branch: "feat/x",
    worktreePath: "/wt/feat-x",
    latestTurn: {
      state: "completed",
      startedAt: "2026-01-01T00:30:00.000Z",
      completedAt: "2026-01-01T01:00:00.000Z",
    } as never,
    session: { status: "idle" } as never,
    planProgress: { step: "Running tests", completedSteps: 2, totalSteps: 5 } as never,
    childStatus: "child is writing tests",
  });
  expect(status.threadId).toBe("thread-1");
  expect(status.state).toBe("completed");
  expect(status.provider).toBe("claude");
  expect(status.model).toBe("claude-opus");
  expect(status.branch).toBe("feat/x");
  expect(status.worktreePath).toBe("/wt/feat-x");
  expect(status.inProgressToolCall).toBe("Running tests");
  expect(status.childStatus).toBe("child is writing tests");
  expect(status.settledOverride).toBeNull();
  expect(status.settledAt).toBeNull();
  expect(status.lastActivityAt).toBe("2026-01-01T01:00:00.000Z");
});

it("surfaces the settle marker on the status record (GHE #304)", () => {
  const status = deriveThreadRunStatus({
    ...shellBase,
    modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
    branch: "feat/x",
    worktreePath: "/wt/feat-x",
    latestTurn: null,
    session: null,
    settledOverride: "settled",
    settledAt: "2026-01-05T00:00:00.000Z",
  });
  expect(status.settledOverride).toBe("settled");
  expect(status.settledAt).toBe("2026-01-05T00:00:00.000Z");
});

it("tolerates a missing model selection", () => {
  const status = deriveThreadRunStatus({
    ...shellBase,
    modelSelection: null as never,
    latestTurn: null,
    session: null,
  });
  expect(status.provider).toBeNull();
  expect(status.model).toBeNull();
  expect(status.state).toBe("idle");
});
