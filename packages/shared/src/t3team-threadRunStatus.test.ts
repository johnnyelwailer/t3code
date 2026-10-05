import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  deriveThreadRunState,
  deriveThreadRunStatus,
  isTerminalThreadRunState,
  type ThreadRunStatusInput,
} from "./t3team-threadRunStatus.ts";
import { deriveThreadAwaitingParent } from "./t3team-threadAwaitingParent.ts";

const at = (iso: string) => DateTime.makeUnsafe(iso);

const shell: ThreadRunStatusInput = {
  id: ThreadId.make("thread-1"),
  title: "My thread",
  modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
  branch: null,
  worktreePath: null,
  status: "idle",
  createdAt: at("2026-01-01T00:00:00.000Z"),
  updatedAt: at("2026-01-01T01:00:00.000Z"),
  settledOverride: null,
  settledAt: null,
  interactionMode: "default",
  hasActionableProposedPlan: false,
  pendingRuntimeRequest: null,
};

describe("deriveThreadRunState", () => {
  it("reads active run statuses and an activity-owning run as running", () => {
    for (const status of ["preparing", "queued", "starting", "running", "waiting"] as const) {
      expect(deriveThreadRunState({ status })).toBe("running");
    }
    expect(deriveThreadRunState({ status: "completed", activityRunStatus: "starting" })).toBe(
      "running",
    );
  });

  it("maps terminal run statuses", () => {
    expect(deriveThreadRunState({ status: "completed" })).toBe("completed");
    expect(deriveThreadRunState({ status: "failed" })).toBe("failed");
    expect(deriveThreadRunState({ status: "interrupted" })).toBe("aborted");
    expect(deriveThreadRunState({ status: "cancelled" })).toBe("aborted");
    expect(deriveThreadRunState({ status: "rolled_back" })).toBe("idle");
    expect(deriveThreadRunState({ status: "idle" })).toBe("idle");
  });

  it("keeps a settled run running while non-subagent background work is pending", () => {
    expect(
      deriveThreadRunState({ status: "completed", pendingBackgroundTasks: [{ kind: "command" }] }),
    ).toBe("running");
  });

  it("reads live child work as waiting only in place of completed/idle", () => {
    const subagent = [{ kind: "subagent" }];
    expect(deriveThreadRunState({ status: "completed", pendingBackgroundTasks: subagent })).toBe(
      "waiting",
    );
    expect(deriveThreadRunState({ status: "idle", hasLiveChildren: true })).toBe("waiting");
    expect(deriveThreadRunState({ status: "running", hasLiveChildren: true })).toBe("running");
    expect(deriveThreadRunState({ status: "failed", hasLiveChildren: true })).toBe("failed");
    expect(deriveThreadRunState({ status: "interrupted", pendingBackgroundTasks: subagent })).toBe(
      "aborted",
    );
  });

  it("treats waiting as non-terminal", () => {
    expect(isTerminalThreadRunState("waiting")).toBe(false);
    expect(isTerminalThreadRunState("running")).toBe(false);
    expect(isTerminalThreadRunState("idle")).toBe(false);
    expect(isTerminalThreadRunState("completed")).toBe(true);
    expect(isTerminalThreadRunState("failed")).toBe(true);
    expect(isTerminalThreadRunState("aborted")).toBe(true);
  });
});

describe("deriveThreadRunStatus", () => {
  it("derives the full record from a V2 shell plus fork facts", () => {
    const status = deriveThreadRunStatus({
      ...shell,
      branch: "feat/x",
      worktreePath: "/wt/feat-x",
      status: "completed",
      latestRunStartedAt: at("2026-01-01T00:30:00.000Z"),
      latestRunCompletedAt: at("2026-01-01T01:00:00.000Z"),
      settledOverride: "settled",
      settledAt: at("2026-01-05T00:00:00.000Z"),
      childStatus: "child is writing tests",
    });
    expect(status).toMatchObject({
      threadId: "thread-1",
      state: "completed",
      provider: "claude",
      model: "claude-opus",
      branch: "feat/x",
      latestRunStatus: "completed",
      latestRunStartedAt: "2026-01-01T00:30:00.000Z",
      latestRunCompletedAt: "2026-01-01T01:00:00.000Z",
      lastActivityAt: "2026-01-01T01:00:00.000Z",
      childStatus: "child is writing tests",
      settledOverride: "settled",
      settledAt: "2026-01-05T00:00:00.000Z",
      awaitingUserInput: false,
      awaitingParent: false,
      environment: null,
      lastError: null,
    });
  });

  it("surfaces a pending runtime request as awaitingUserInput", () => {
    const status = deriveThreadRunStatus({
      ...shell,
      status: "waiting",
      pendingRuntimeRequest: {
        id: RuntimeRequestId.make("request-1"),
        kind: "user_input",
        createdAt: at("2026-01-01T00:40:00.000Z"),
      },
    });
    expect(status.awaitingUserInput).toBe(true);
    expect(status.state).toBe("running");
  });

  it("flags a settled plan-mode thread with an actionable plan as awaitingParent", () => {
    const status = deriveThreadRunStatus({
      ...shell,
      status: "completed",
      interactionMode: "plan",
      hasActionableProposedPlan: true,
      hasLiveChildren: true,
    });
    expect(status.state).toBe("waiting");
    expect(status.awaitingParent).toBe(true);
  });
});

it("awaitingParent needs plan mode, a completed run and an actionable plan", () => {
  const base = { interactionMode: "plan", latestRunStatus: "completed" } as const;
  expect(deriveThreadAwaitingParent({ ...base, hasActionableProposedPlan: true })).toBe(true);
  expect(deriveThreadAwaitingParent({ ...base, hasActionableProposedPlan: false })).toBe(false);
  expect(
    deriveThreadAwaitingParent({
      ...base,
      interactionMode: "default",
      hasActionableProposedPlan: true,
    }),
  ).toBe(false);
  expect(
    deriveThreadAwaitingParent({
      ...base,
      latestRunStatus: "running",
      hasActionableProposedPlan: true,
    }),
  ).toBe(false);
});
