import { EnvironmentId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ActivePlanState } from "../session-logic";
import { makeThreadFixture } from "../test-fixtures";
import type { Thread } from "../types";
import {
  createLocalDispatchSnapshot,
  deriveComposerTasksProgress,
  hasLocalDispatchGoneStuck,
  LOCAL_DISPATCH_STUCK_BACKSTOP_MS,
} from "./ChatView.logic";

const now = "2026-03-29T00:00:00.000Z";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return makeThreadFixture({
    id: ThreadId.make("thread-1"),
    environmentId: EnvironmentId.make("environment-local"),
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    runtime: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    latestRun: null,
    branch: null,
    worktreePath: null,
    ...overrides,
  });
}

const completedTurn = {
  runId: RunId.make("turn-1"),
  status: "completed" as const,
  requestedAt: now,
  startedAt: "2026-03-29T00:00:01.000Z",
  completedAt: "2026-03-29T00:00:10.000Z",
  assistantMessageId: null,
};

const readySession = {
  status: "completed" as const,
  providerName: "codex",
  providerInstanceId: ProviderInstanceId.make("codex"),
  activeRunId: null,
  lastError: null,
  updatedAt: "2026-03-29T00:00:10.000Z",
};

describe("hasLocalDispatchGoneStuck", () => {
  // The snapshot stamps startedAt with the real clock at creation; pin it so
  // every case is deterministic.
  const dispatchAt = "2026-03-29T01:00:00.000Z";
  const stuckDispatch = () => ({
    ...createLocalDispatchSnapshot(makeThread()),
    startedAt: dispatchAt,
  });
  const at = (minutes: number, seconds = 0) =>
    new Date(Date.parse(dispatchAt) + minutes * 60_000 + seconds * 1_000).toISOString();
  const backstopMs = LOCAL_DISPATCH_STUCK_BACKSTOP_MS;

  it("abandons an unacknowledged dispatch only after the idle window", () => {
    const localDispatch = stuckDispatch();
    const input = {
      localDispatch,
      latestRun: null,
      latestUserMessageCreatedAt: null,
      runtime: null,
      hasPendingApproval: false,
      hasPendingUserInput: false,
      threadError: null,
      preparingWorktree: false,
    };

    expect(hasLocalDispatchGoneStuck({ ...input, now: at(4, 59) })).toBe(false);
    // Exactly the backstop elapses: recovered.
    expect(hasLocalDispatchGoneStuck({ ...input, now: at(backstopMs / 60_000, 0) })).toBe(true);
  });

  it("slides the window with recent server-visible activity", () => {
    const localDispatch = stuckDispatch();
    const activity = "2026-03-29T01:04:00.000Z"; // 4 minutes after the send
    const runtime = { ...readySession, status: "running" as const, updatedAt: activity };
    const run = { ...completedTurn, startedAt: activity, completedAt: null };

    // 6 minutes elapsed, but the last activity is 4 minutes old: still inside
    // the window.
    expect(
      hasLocalDispatchGoneStuck({
        localDispatch,
        latestRun: run,
        latestUserMessageCreatedAt: null,
        runtime,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
        preparingWorktree: false,
        now: "2026-03-29T01:06:00.000Z",
      }),
    ).toBe(false);
    // The same activity now 5 minutes old: the window closed.
    expect(
      hasLocalDispatchGoneStuck({
        localDispatch,
        latestRun: run,
        latestUserMessageCreatedAt: null,
        runtime,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
        preparingWorktree: false,
        now: "2026-03-29T01:09:00.000Z",
      }),
    ).toBe(true);
  });

  it("never abandons a dispatch that is still preparing the worktree", () => {
    const localDispatch = { ...stuckDispatch(), preparingWorktree: true };
    expect(
      hasLocalDispatchGoneStuck({
        localDispatch,
        latestRun: null,
        latestUserMessageCreatedAt: null,
        runtime: null,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
        preparingWorktree: true,
        now: at(30),
      }),
    ).toBe(false);
  });

  it("leaves already-resolved dispatch states to their own paths", () => {
    const localDispatch = stuckDispatch();
    const base = {
      latestRun: null,
      latestUserMessageCreatedAt: null,
      runtime: null,
      threadError: null,
      preparingWorktree: false,
      hasPendingApproval: false,
      hasPendingUserInput: false,
      now: at(30),
    };

    expect(
      hasLocalDispatchGoneStuck({
        ...base,
        localDispatch,
        hasPendingApproval: true,
        hasPendingUserInput: false,
      }),
    ).toBe(false);
    expect(
      hasLocalDispatchGoneStuck({
        ...base,
        localDispatch,
        hasPendingApproval: false,
        hasPendingUserInput: true,
      }),
    ).toBe(false);
    expect(hasLocalDispatchGoneStuck({ ...base, localDispatch, threadError: "failed" })).toBe(
      false,
    );
  });

  it("floors the window at the send itself when the server emits nothing", () => {
    const localDispatch = stuckDispatch();
    // A clock that runs behind: server timestamps predate the client's send.
    const oldRuntime = { ...readySession, updatedAt: "2026-03-28T23:59:00.000Z" };
    expect(
      hasLocalDispatchGoneStuck({
        localDispatch,
        latestRun: null,
        latestUserMessageCreatedAt: null,
        runtime: oldRuntime,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
        preparingWorktree: false,
        now: at(5, 1),
      }),
    ).toBe(true);
  });

  it("never abandons on an unparseable clock", () => {
    const localDispatch = stuckDispatch();
    expect(
      hasLocalDispatchGoneStuck({
        localDispatch,
        latestRun: null,
        latestUserMessageCreatedAt: null,
        runtime: null,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
        preparingWorktree: false,
        now: "not-a-date",
      }),
    ).toBe(false);
  });
});

// The 12-step plan actually stored for thread fbdb583b-a0b1-48e9-ae87-5e1cfe46dcf0.
// One step inProgress, two completed, nine pending.
const REAL_THREAD_SCOPED_PLAN: ActivePlanState["steps"] = [
  { step: "Variant B: PR #476 open, waiting on #468 for full green gate", status: "inProgress" },
  { step: "Per-thread quickstart picker + Legacy variant", status: "pending" },
  { step: "Owner browser verification: #468 (6007) + #472 (6006)", status: "pending" },
  { step: "CR revert UI-rule pass + rename Loslegen→Quickstart", status: "completed" },
  { step: "Main LOC ratchet debt: pi-session shrink + pi-mcp pin", status: "completed" },
  { step: "Final disk sweep: ~18 remaining orphan dirs, ~51Gi", status: "pending" },
  { step: "Gate 4 source freeze → close #365", status: "pending" },
  { step: "#433 disposition", status: "pending" },
  { step: "Two flaky CR coverage tests → ticket", status: "pending" },
  {
    step: "Aspire stack: all 3 variants, per-thread switching, owner click-test",
    status: "pending",
  },
  { step: "Reorganize Storybook story titles into logical hierarchy", status: "pending" },
  { step: "Project-level glossary: drafts promote from session to project", status: "pending" },
];

describe("deriveComposerTasksProgress", () => {
  it("renders a plan written by an earlier run while a later run is latest", () => {
    // The badge is a task list, not only live progress: run settledness and
    // run ownership are not inputs, so the list survives the run finishing.
    const badge = deriveComposerTasksProgress({
      activeLatestRunId: RunId.make("run-2"),
      activePlan: {
        createdAt: "2026-09-10T10:00:00.000Z",
        runId: RunId.make("run-1"),
        steps: REAL_THREAD_SCOPED_PLAN,
      },
    });
    expect(badge.progress).toEqual({
      step: "Variant B: PR #476 open, waiting on #468 for full green gate",
      completedSteps: 2,
      totalSteps: 12,
    });
    expect(badge.steps).toHaveLength(12);
    expect(badge.planUpdatedAt).toBe("2026-09-10T10:00:00.000Z");
  });

  it("reports live progress (current step, completed/total, durations) for an active run", () => {
    const badge = deriveComposerTasksProgress({
      activeLatestRunId: RunId.make("run-1"),
      activePlan: {
        createdAt: "2026-09-10T10:00:30.000Z",
        runId: RunId.make("run-1"),
        steps: [
          { step: "First", status: "completed", durationMs: 30_000 },
          { step: "Second", status: "inProgress" },
        ],
      },
    });
    expect(badge.progress).toEqual({ step: "Second", completedSteps: 1, totalSteps: 2 });
    // Duration of the completed step (30s) flows through unchanged.
    expect(badge.steps).toEqual([
      { step: "First", status: "completed", durationMs: 30_000 },
      { step: "Second", status: "inProgress" },
    ]);
  });

  it("reports nothing when the thread has a plan but no latest run", () => {
    expect(
      deriveComposerTasksProgress({
        activeLatestRunId: null,
        activePlan: { createdAt: "2026-09-10T10:00:00.000Z", runId: null, steps: [] },
      }),
    ).toEqual({ progress: null, steps: null, planUpdatedAt: null });
  });
});
