import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import {
  deriveThreadRunState,
  deriveThreadRunStatus,
  isTerminalThreadRunState,
} from "./t3team-threadRunStatus.ts";
import { hasOpenChildWaits } from "./t3team-childWaitFacts.ts";
import {
  deriveThreadAwaitingParent,
  threadHasActionableProposedPlan,
} from "./t3team-threadAwaitingParent.ts";

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

describe("waiting state (settled own work + live t3team children)", () => {
  it("replaces a would-be completed", () => {
    expect(
      deriveThreadRunState({
        session: { status: "idle" },
        latestTurn: { state: "completed" },
        hasLiveChildren: true,
      }),
    ).toBe("waiting");
  });

  it("replaces a would-be idle", () => {
    expect(deriveThreadRunState({ session: null, latestTurn: null, hasLiveChildren: true })).toBe(
      "waiting",
    );
  });

  it("own live work still wins (running)", () => {
    expect(
      deriveThreadRunState({
        session: { status: "running" },
        latestTurn: null,
        hasLiveChildren: true,
      }),
    ).toBe("running");
  });

  it("a dead or aborted parent stays failed/aborted", () => {
    expect(
      deriveThreadRunState({
        session: { status: "error" },
        latestTurn: null,
        hasLiveChildren: true,
      }),
    ).toBe("failed");
    expect(
      deriveThreadRunState({
        session: { status: "stopped" },
        latestTurn: null,
        hasLiveChildren: true,
      }),
    ).toBe("aborted");
  });

  it("the terminal predicate treats waiting itself as non-terminal", () => {
    expect(isTerminalThreadRunState("waiting")).toBe(false);
    expect(isTerminalThreadRunState("completed")).toBe(true);
    expect(isTerminalThreadRunState("failed")).toBe(true);
    expect(isTerminalThreadRunState("aborted")).toBe(true);
    expect(isTerminalThreadRunState("running")).toBe(false);
    expect(isTerminalThreadRunState("idle")).toBe(false);
  });

  it("flows through the full status record", () => {
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
      hasLiveChildren: true,
    });
    expect(status.state).toBe("waiting");
  });
});

describe("waitingDeclared (a registered op:wait is still pending)", () => {
  it("is true on the full status record when hasOpenChildWaits is set", () => {
    const status = deriveThreadRunStatus({
      ...shellBase,
      modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
      branch: null,
      worktreePath: null,
      latestTurn: null,
      session: { status: "idle" } as never,
      hasOpenChildWaits: true,
    });
    // Declared waiting does NOT change the state — it rides alongside it.
    expect(status.waitingDeclared).toBe(true);
    expect(status.state).toBe("idle");
  });

  it("defaults to false when the flag is absent or false", () => {
    expect(
      deriveThreadRunStatus({
        ...shellBase,
        modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
        latestTurn: null,
        session: { status: "idle" } as never,
      }).waitingDeclared,
    ).toBe(false);
    expect(
      deriveThreadRunStatus({
        ...shellBase,
        modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
        latestTurn: null,
        session: { status: "idle" } as never,
        hasOpenChildWaits: false,
      }).waitingDeclared,
    ).toBe(false);
  });

  it("composes with the derived waiting state: both can be true at once", () => {
    const status = deriveThreadRunStatus({
      ...shellBase,
      modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "claude-opus" },
      latestTurn: { state: "completed" } as never,
      session: { status: "idle" } as never,
      hasLiveChildren: true,
      hasOpenChildWaits: true,
    });
    expect(status.state).toBe("waiting");
    expect(status.waitingDeclared).toBe(true);
  });

  it("is derived from the thread's durable activities, not a flag anyone sets", () => {
    const registered = {
      kind: "t3team.child_wait.registered",
      payload: { waitId: "w1", childThreadId: "child-1" },
    };
    const resolved = {
      kind: "t3team.child_wait.resolved",
      payload: { waitId: "w1", childThreadId: "child-1" },
    };
    expect(hasOpenChildWaits([registered])).toBe(true);
    expect(hasOpenChildWaits([registered, resolved])).toBe(false);
    expect(hasOpenChildWaits([])).toBe(false);
  });
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

it("surfaces a pending user-input request as awaitingUserInput", () => {
  expect(
    deriveThreadRunStatus({
      ...shellBase,
      modelSelection: null as never,
      latestTurn: null,
      session: null,
      hasPendingUserInput: true,
    }).awaitingUserInput,
  ).toBe(true);
  expect(
    deriveThreadRunStatus({
      ...shellBase,
      modelSelection: null as never,
      latestTurn: null,
      session: null,
      hasPendingUserInput: false,
    }).awaitingUserInput,
  ).toBe(false);
  // Detail loads carry no shell flag — they derive the fact from activities.
  expect(
    deriveThreadRunStatus({
      ...shellBase,
      modelSelection: null as never,
      latestTurn: null,
      session: null,
    }).awaitingUserInput,
  ).toBe(false);
});

it("surfaces a settled plan-mode thread with an unimplemented plan as awaitingParent", () => {
  // The incident shape: the plan turn settled cleanly (state stays
  // "completed" — the turn IS done) while the actionable plan fact says the
  // parent owes this thread a decision.
  const status = deriveThreadRunStatus({
    ...shellBase,
    modelSelection: null as never,
    session: { status: "idle" } as never,
    latestTurn: { state: "completed" } as never,
    interactionMode: "plan",
    hasActionableProposedPlan: true,
  });
  expect(status.state).toBe("completed");
  expect(status.awaitingParent).toBe(true);
});

it("awaitingParent stays false without every ingredient", () => {
  const base = {
    ...shellBase,
    modelSelection: null as never,
    session: { status: "idle" } as never,
    latestTurn: { state: "completed" } as never,
  };
  // Not plan mode.
  expect(
    deriveThreadRunStatus({ ...base, interactionMode: "default", hasActionableProposedPlan: true })
      .awaitingParent,
  ).toBe(false);
  // Plan mode, but no recorded actionable plan.
  expect(
    deriveThreadRunStatus({ ...base, interactionMode: "plan", hasActionableProposedPlan: false })
      .awaitingParent,
  ).toBe(false);
  // Plan mode + actionable plan, but the turn has not settled cleanly.
  expect(
    deriveThreadRunStatus({
      ...base,
      interactionMode: "plan",
      hasActionableProposedPlan: true,
      latestTurn: { state: "running" } as never,
    }).awaitingParent,
  ).toBe(false);
  expect(
    deriveThreadRunStatus({
      ...base,
      interactionMode: "plan",
      hasActionableProposedPlan: true,
      latestTurn: null,
    }).awaitingParent,
  ).toBe(false);
});

it("awaitingParent composes with the waiting state (settled plan, live grandchildren)", () => {
  // Own work settled, a grandchild still live: state reads waiting (non-
  // terminal subtree) while the owed-plan fact rides alongside — the two
  // facts stay independent instead of one state with a reason.
  const status = deriveThreadRunStatus({
    ...shellBase,
    modelSelection: null as never,
    session: { status: "idle" } as never,
    latestTurn: { state: "completed" } as never,
    interactionMode: "plan",
    hasActionableProposedPlan: true,
    hasLiveChildren: true,
  });
  expect(status.state).toBe("waiting");
  expect(status.awaitingParent).toBe(true);
});

it("threadHasActionableProposedPlan mirrors the projection's precedence", () => {
  const latestTurn = { turnId: "turn-1" };
  expect(threadHasActionableProposedPlan(latestTurn, [])).toBe(false);
  expect(threadHasActionableProposedPlan(latestTurn, undefined)).toBe(false);
  // The latest turn's own unimplemented plan decides when it has one.
  expect(
    threadHasActionableProposedPlan(latestTurn, [
      { id: "p-1", turnId: "turn-1", implementedAt: null, updatedAt: "2026-01-01T00:09:00.000Z" },
    ]),
  ).toBe(true);
  // …and a consumed plan clears it even while an older plan is still open.
  expect(
    threadHasActionableProposedPlan(latestTurn, [
      { id: "p-0", turnId: null, implementedAt: null, updatedAt: "2026-01-01T00:01:00.000Z" },
      {
        id: "p-1",
        turnId: "turn-1",
        implementedAt: "2026-01-01T01:00:00.000Z",
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
    ]),
  ).toBe(false);
  // No plan owned by the latest turn: the NEWEST plan decides.
  expect(
    threadHasActionableProposedPlan(latestTurn, [
      {
        id: "p-0",
        turnId: "turn-0",
        implementedAt: "2026-01-01T00:02:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
      { id: "p-1", turnId: "turn-0", implementedAt: null, updatedAt: "2026-01-01T00:05:00.000Z" },
    ]),
  ).toBe(true);
  expect(
    threadHasActionableProposedPlan(latestTurn, [
      { id: "p-0", turnId: "turn-0", implementedAt: null, updatedAt: "2026-01-01T00:05:00.000Z" },
    ]),
  ).toBe(true);
});

it("deriveThreadAwaitingParent is the same predicate on the raw facts", () => {
  expect(
    deriveThreadAwaitingParent({
      interactionMode: "plan",
      latestTurn: { state: "completed" },
      hasActionableProposedPlan: true,
    }),
  ).toBe(true);
  expect(
    deriveThreadAwaitingParent({
      interactionMode: "default",
      latestTurn: { state: "completed" },
      hasActionableProposedPlan: true,
    }),
  ).toBe(false);
});
