/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests bridge Effect runtimes manually; tracked cleanup is separate from the green gate. */
import { describe, expect, it } from "vite-plus/test";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  callT3TeamChildrenTool,
  type ChildThreadDetail,
  type ChildThreadShell,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildren.ts";

const CALLER = ThreadId.make("caller-thread");
const PROJECT = ProjectId.make("project-1");
const CHILD = ThreadId.make("child-thread");

const childShell: ChildThreadShell = {
  id: CHILD,
  title: "Child work",
  modelSelection: { instanceId: "claude" as never, model: "claude-opus" },
  branch: "feat/child",
  worktreePath: "/wt/child",
  latestTurn: {
    state: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:10:00.000Z",
  } as never,
  session: { status: "idle" } as never,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:10:00.000Z",
  childStatus: null,
  settledOverride: null,
  settledAt: null,
};

const callerDetail: ChildThreadDetail = {
  ...childShell,
  id: CALLER,
  title: "Caller",
  projectId: PROJECT,
  activities: [
    {
      kind: "t3team.handoff.started",
      summary: "Started child session Child work",
      createdAt: "2026-01-01T00:00:00.000Z",
      payload: { childThreadId: CHILD, childTitle: "Child work" },
    },
  ],
  messages: [{ role: "assistant", text: "done", createdAt: "2026-01-01T00:10:00.000Z" }],
};

const childDetail: ChildThreadDetail = {
  ...childShell,
  projectId: PROJECT,
  activities: [],
  messages: [
    { role: "assistant", text: "I finished the task", createdAt: "2026-01-01T00:10:00.000Z" },
  ],
};

function makeDeps(overrides: Partial<T3TeamChildrenToolDeps> = {}): TestDeps {
  const appended: Array<{ threadId: string; kind: string; payload: unknown }> = [];
  const interrupted: string[] = [];
  const settled: string[] = [];
  const base: T3TeamChildrenToolDeps = {
    callerThreadId: CALLER,
    callerProjectId: PROJECT,
    loadThreadDetail: (id) =>
      Effect.succeed(id === CALLER ? callerDetail : id === CHILD ? childDetail : undefined),
    loadThreadShell: (id) =>
      Effect.succeed(id === CALLER ? childShell : id === CHILD ? childShell : undefined),
    listProjectThreadShells: () => Effect.succeed([childShell]),
    listChildThreadIds: () => Effect.succeed([CHILD]),
    listParentChildRelations: () => Effect.succeed([]),
    appendActivity: (threadId, input) =>
      Effect.sync(() => {
        appended.push({ threadId, kind: input.kind, payload: input.payload });
      }),
    interruptTurn: (threadId) => Effect.sync(() => interrupted.push(threadId)),
    settleThread: (threadId) => Effect.sync(() => settled.push(threadId)),
    drainOwnMailbox: () =>
      Effect.succeed({ state: "dispatched" as const, delivered: 1, subjects: ["Subject A"] }),
    nowIso: () => "2026-01-01T00:20:00.000Z",
    newId: () => "wait-1",
    ...overrides,
  };
  return { ...base, __appended: appended, __interrupted: interrupted, __settled: settled };
}

interface TestDeps extends T3TeamChildrenToolDeps {
  __appended: Array<{ threadId: string; kind: string; payload: unknown }>;
  __interrupted: string[];
  __settled: string[];
}

const run = (deps: TestDeps, args: unknown) =>
  Effect.runPromise(callT3TeamChildrenTool({ toolArgs: args, deps })).then((result) => ({
    text: result.content[0]?.text ?? "",
    structured: (result.structuredContent ?? {}) as Record<string, unknown>,
    isError: result.isError,
  }));

describe("children tool — op dispatch & validation", () => {
  it("rejects a missing op with the op vocabulary", async () => {
    const out = await run(makeDeps(), {});
    expect(out.isError).toBe(true);
    expect(out.text).toContain("requires an 'op'");
    expect(out.text).toContain("list");
  });

  it("rejects an unknown op and names it", async () => {
    const out = await run(makeDeps(), { op: "destroy" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Unknown op 'destroy'");
  });

  it("help returns all op usages when op_name is omitted", async () => {
    const out = await run(makeDeps(), { op: "help" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.ops).toHaveProperty("wait");
    expect(out.structured.ops).toHaveProperty("list");
  });

  it("help returns the schema for one op", async () => {
    const out = await run(makeDeps(), { op: "help", op_name: "wait" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.usage).toContain("thread_id");
  });

  it("help rejects an unknown op_name", async () => {
    const out = await run(makeDeps(), { op: "help", op_name: "nope" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Unknown op 'nope'");
  });
});

describe("children tool — list", () => {
  it("lists the caller's children with live state", async () => {
    const out = await run(makeDeps(), { op: "list" });
    expect(out.isError).toBeFalsy();
    const rows = out.structured.threads as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.threadId).toBe(CHILD);
    expect(rows[0]!.state).toBe("completed");
    expect(rows[0]!.provider).toBe("claude");
    expect(rows[0]!.branch).toBe("feat/child");
  });

  it("all:true lists the whole project", async () => {
    const out = await run(makeDeps(), { op: "list", all: true });
    expect(out.isError).toBeFalsy();
    expect(out.structured.scope).toBe("project");
    expect(out.structured.count).toBe(1);
  });

  it("reports no children with a hint", async () => {
    const deps = makeDeps({
      loadThreadDetail: () => Effect.succeed({ ...callerDetail, activities: [] }),
      listChildThreadIds: () => Effect.succeed([]),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.count).toBe(0);
    expect(out.structured.hint).toContain("t3team_start_child");
  });

  it("lists children from the parent/child relation even when the caller has no handoff.started activity (GHE #178)", async () => {
    // The child was created via the orchestration engine: only the child-side
    // t3team.handoff.created exists (payload.parentThreadId), so the caller's
    // own activity load contains no t3team.handoff.started rows. The list op
    // must still surface the child — it derives from listChildThreadIds, not
    // from the caller's activities.
    const deps = makeDeps({
      loadThreadDetail: () => Effect.succeed({ ...callerDetail, activities: [] }),
      listChildThreadIds: () => Effect.succeed([CHILD]),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.scope).toBe("children");
    expect(out.structured.count).toBe(1);
    const rows = out.structured.threads as Array<Record<string, unknown>>;
    expect(rows[0]!.threadId).toBe(CHILD);
    expect(rows[0]!.state).toBe("completed");
  });

  it("marks a child whose shell is gone as unavailable", async () => {
    const deps = makeDeps({
      listChildThreadIds: () => Effect.succeed([CHILD]),
      loadThreadShell: () => Effect.succeed(undefined),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    const rows = out.structured.threads as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.threadId).toBe(CHILD);
    expect(rows[0]!.state).toBe("unknown");
    expect(rows[0]!.note).toContain("no longer available");
  });

  it("flags a child with a question docked in its composer (shell hasPendingUserInput)", async () => {
    const pendingShell: ChildThreadShell = { ...childShell, hasPendingUserInput: true };
    const deps = makeDeps({
      listProjectThreadShells: () => Effect.succeed([pendingShell]),
      loadThreadShell: () => Effect.succeed(pendingShell),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    const rows = out.structured.threads as Array<Record<string, unknown>>;
    expect(rows[0]!.awaitingUserInput).toBe(true);
  });
});

describe("children tool — waiting state (parent with live t3team children)", () => {
  const runningShell: ChildThreadShell = {
    ...childShell,
    session: { status: "running" } as never,
    latestTurn: { state: "running", startedAt: "2026-01-01T00:05:00.000Z" } as never,
  };
  const relations = [
    { childThreadId: "child-thread", parentThreadId: "caller-thread" },
  ];

  it("status: parent settled + running child → waiting", async () => {
    const deps = makeDeps({
      listParentChildRelations: () => Effect.succeed(relations),
      loadThreadShell: (id) =>
        Effect.succeed(id === CHILD ? runningShell : id === CALLER ? childShell : undefined),
    });
    const out = await run(deps, { op: "status", thread_id: "caller-thread" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.state).toBe("waiting");
  });

  it("status: parent settled + all children terminal → completed", async () => {
    const deps = makeDeps({
      listParentChildRelations: () => Effect.succeed(relations),
      // child-thread's shell is the settled `childShell` (turn completed).
    });
    const out = await run(deps, { op: "status", thread_id: "caller-thread" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.state).toBe("completed");
  });

  it("status: a settled child does not keep the parent waiting", async () => {
    const settledRunning: ChildThreadShell = { ...runningShell, settledOverride: "settled" };
    const deps = makeDeps({
      listParentChildRelations: () => Effect.succeed(relations),
      loadThreadShell: (id) =>
        Effect.succeed(id === CHILD ? settledRunning : id === CALLER ? childShell : undefined),
    });
    const out = await run(deps, { op: "status", thread_id: "caller-thread" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.state).toBe("completed");
  });

  it("status: legacy parent:N sub-runs (no handoff relation) do not trigger waiting", async () => {
    // The caller's `caller:1` sub-run exists as a thread but has NO t3team
    // handoff relation — the default relations list is empty, so no child is
    // ever probed and the parent stays completed.
    const out = await run(makeDeps(), { op: "status", thread_id: "caller-thread" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.state).toBe("completed");
  });

  it("list: a row's own running work outranks its live children (stays running)", async () => {
    const deps = makeDeps({
      loadThreadShell: (id) =>
        Effect.succeed(id === CHILD ? runningShell : id === CALLER ? childShell : runningShell),
      listParentChildRelations: () =>
        Effect.succeed([{ childThreadId: "grand-child", parentThreadId: "child-thread" }]),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    const rows = out.structured.threads as Array<Record<string, unknown>>;
    expect(rows[0]!.state).toBe("running");
  });

  it("list: a settled row with a running grandchild reads waiting", async () => {
    const deps = makeDeps({
      loadThreadShell: (id) =>
        Effect.succeed(id === CHILD ? childShell : id === CALLER ? childShell : runningShell),
      listParentChildRelations: () =>
        Effect.succeed([{ childThreadId: "grand-child", parentThreadId: "child-thread" }]),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    const rows = out.structured.threads as Array<Record<string, unknown>>;
    expect(rows[0]!.state).toBe("waiting");
  });

  it("list all:true: waiting resolves in memory from the project snapshot", async () => {
    // The grandchild lives in the same project snapshot as its parent row,
    // exactly as handoff-created children do — no shell loads needed.
    const grandShell: ChildThreadShell = { ...runningShell, id: "grand-child" as never };
    const deps = makeDeps({
      listProjectThreadShells: () => Effect.succeed([childShell, grandShell]),
      listParentChildRelations: () =>
        Effect.succeed([{ childThreadId: "grand-child", parentThreadId: "child-thread" }]),
    });
    const out = await run(deps, { op: "list", all: true });
    expect(out.isError).toBeFalsy();
    const rows = out.structured.threads as Array<Record<string, unknown>>;
    expect(rows[0]!.threadId).toBe(CHILD);
    expect(rows[0]!.state).toBe("waiting");
  });
});

describe("children tool — status", () => {
  it("requires thread_id and names the op", async () => {
    const out = await run(makeDeps(), { op: "status" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("thread_id' is required");
  });

  it("returns the current turn state and a recent-activity tail", async () => {
    const out = await run(makeDeps(), { op: "status", thread_id: CHILD });
    expect(out.isError).toBeFalsy();
    const currentTurn = out.structured.currentTurn as Record<string, unknown>;
    expect(currentTurn.state).toBe("completed");
    expect(out.structured.recentActivity).toEqual([]);
  });

  it("rejects a thread in another project", async () => {
    const otherDetail = { ...childDetail, projectId: ProjectId.make("other") };
    const deps = makeDeps({
      loadThreadDetail: (id) => Effect.succeed(id === CHILD ? otherDetail : undefined),
    });
    const out = await run(deps, { op: "status", thread_id: CHILD });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("different project");
  });

  it("flags awaitingUserInput when the detail carries an open question", async () => {
    const pendingDetail: ChildThreadDetail = {
      ...childDetail,
      activities: [
        {
          kind: "user-input.requested",
          summary: "User input requested",
          createdAt: "2026-01-01T00:11:00.000Z",
          payload: { requestId: "req-1", questions: [], responseMode: "message" },
        },
      ],
    };
    const deps = makeDeps({
      loadThreadDetail: (id) =>
        Effect.succeed(id === CALLER ? callerDetail : id === CHILD ? pendingDetail : undefined),
    });
    const out = await run(deps, { op: "status", thread_id: CHILD });
    expect(out.isError).toBeFalsy();
    expect(out.structured.awaitingUserInput).toBe(true);
    // A resolved question clears the flag.
    const answeredDetail: ChildThreadDetail = {
      ...pendingDetail,
      activities: [
        ...pendingDetail.activities,
        {
          kind: "user-input.resolved",
          summary: "User input submitted",
          createdAt: "2026-01-01T00:12:00.000Z",
          payload: { requestId: "req-1", answers: {} },
        },
      ],
    };
    const answered = await run(
      makeDeps({
        loadThreadDetail: (id) =>
          Effect.succeed(id === CALLER ? callerDetail : id === CHILD ? answeredDetail : undefined),
      }),
      { op: "status", thread_id: CHILD },
    );
    expect(answered.structured.awaitingUserInput).toBeUndefined();
  });
});

describe("children tool — wait", () => {
  it("requires thread_id", async () => {
    const out = await run(makeDeps(), { op: "wait" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("thread_id' is required");
  });

  it("rejects an invalid on value", async () => {
    const out = await run(makeDeps(), { op: "wait", thread_id: CHILD, on: "bogus" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("'on' must be one of");
  });

  it("rejects a non-positive timeout", async () => {
    const out = await run(makeDeps(), { op: "wait", thread_id: CHILD, timeout: 0 });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("positive number of milliseconds");
  });

  it("registers a durable wait activity and returns waiting", async () => {
    const deps = makeDeps();
    const out = await run(deps, { op: "wait", thread_id: CHILD, on: "failed", timeout: 60000 });
    expect(out.isError).toBeFalsy();
    expect(out.structured.status).toBe("waiting");
    expect(out.structured.waitId).toBe("wait-1");
    expect(out.structured.deadlineIso).toBeDefined();
    const registered = deps.__appended.find((a) => a.kind === "t3team.child_wait.registered");
    expect(registered).toBeDefined();
    expect(registered?.threadId).toBe(CALLER);
    expect((registered?.payload as Record<string, unknown>).childThreadId).toBe(CHILD);
    expect((registered?.payload as Record<string, unknown>).on).toBe("failed");
  });
});

describe("children tool — watch (silence watchdog, GHE #63)", () => {
  it("requires thread_id", async () => {
    const out = await run(makeDeps(), { op: "watch" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("thread_id' is required");
  });

  it("rejects a non-positive timeout", async () => {
    const out = await run(makeDeps(), { op: "watch", thread_id: CHILD, timeout: 0 });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("positive number of milliseconds");
  });

  it("registers a durable watch activity with the per-subscription timeout (default 15m)", async () => {
    const deps = makeDeps();
    const out = await run(deps, { op: "watch", thread_id: CHILD });
    expect(out.isError).toBeFalsy();
    expect(out.structured.status).toBe("watching");
    expect(out.structured.watchId).toBe("wait-1");
    expect(out.structured.timeoutMs).toBe(900_000);
    const registered = deps.__appended.find(
      (a) => a.kind === "t3team.thread_silence.watch.registered",
    );
    expect(registered).toBeDefined();
    expect(registered?.threadId).toBe(CALLER);
    expect((registered?.payload as Record<string, unknown>).targetThreadId).toBe(CHILD);
    expect((registered?.payload as Record<string, unknown>).timeoutMs).toBe(900_000);
  });

  it("honors an explicit per-subscription timeout", async () => {
    const deps = makeDeps();
    const out = await run(deps, { op: "watch", thread_id: CHILD, timeout: 1_800_000 });
    expect(out.isError).toBeFalsy();
    expect(out.structured.timeoutMs).toBe(1_800_000);
    const registered = deps.__appended.find(
      (a) => a.kind === "t3team.thread_silence.watch.registered",
    );
    expect((registered?.payload as Record<string, unknown>).timeoutMs).toBe(1_800_000);
  });

  it("unwatch records a durable cancel activity on the caller", async () => {
    const deps = makeDeps();
    const out = await run(deps, { op: "unwatch", thread_id: CHILD });
    expect(out.isError).toBeFalsy();
    expect(out.structured.status).toBe("unwatched");
    const cancelled = deps.__appended.find(
      (a) => a.kind === "t3team.thread_silence.watch.cancelled",
    );
    expect(cancelled).toBeDefined();
    expect(cancelled?.threadId).toBe(CALLER);
    expect((cancelled?.payload as Record<string, unknown>).targetThreadId).toBe(CHILD);
  });

  it("unwatch requires thread_id", async () => {
    const out = await run(makeDeps(), { op: "unwatch" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("thread_id' is required");
  });
});

describe("children tool — stop", () => {
  it("requires thread_id", async () => {
    const out = await run(makeDeps(), { op: "stop" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("thread_id' is required");
  });

  it("interrupts the target thread's turn", async () => {
    const deps = makeDeps();
    const out = await run(deps, { op: "stop", thread_id: CHILD, reason: "done" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.stopped).toBe(true);
    expect(deps.__interrupted).toEqual([CHILD]);
  });
});

describe("children tool — close", () => {
  it("requires thread_id", async () => {
    const out = await run(makeDeps(), { op: "close" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("thread_id' is required");
  });

  it("records a close marker on the caller", async () => {
    const deps = makeDeps();
    const out = await run(deps, { op: "close", thread_id: CHILD });
    expect(out.isError).toBeFalsy();
    expect(out.structured.closed).toBe(true);
    const closed = deps.__appended.find((a) => a.kind === "t3team.child.closed");
    expect(closed).toBeDefined();
    expect(closed?.threadId).toBe(CALLER);
  });
});

const settledChildShell: ChildThreadShell = {
  ...childShell,
  settledOverride: "settled",
  settledAt: "2026-01-02T00:00:00.000Z",
};

describe("children tool — list: settled exclusion (GHE #304)", () => {
  it("excludes settled children by default and reports settledExcluded with a hint", async () => {
    const deps = makeDeps({
      loadThreadShell: (id) => Effect.succeed(id === CHILD ? settledChildShell : undefined),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.count).toBe(0);
    expect(out.structured.settledExcluded).toBe(1);
    expect(out.structured.hint).toContain("include_settled:true");
  });

  it("include_settled:true lists settled children with a settled marker", async () => {
    const deps = makeDeps({
      loadThreadShell: (id) => Effect.succeed(id === CHILD ? settledChildShell : undefined),
    });
    const out = await run(deps, { op: "list", include_settled: true });
    expect(out.isError).toBeFalsy();
    expect(out.structured.count).toBe(1);
    expect(out.structured.settledExcluded).toBeUndefined();
    const row = (out.structured.threads as Array<Record<string, unknown>>)[0]!;
    expect(row.threadId).toBe(CHILD);
    expect(row.settled).toBe(true);
    expect(row.settledAt).toBe("2026-01-02T00:00:00.000Z");
    expect(row.state).toBe("completed");
  });

  it("all:true excludes settled project threads too, counted separately from truncation", async () => {
    const deps = makeDeps({
      listProjectThreadShells: () => Effect.succeed([childShell, settledChildShell]),
    });
    const out = await run(deps, { op: "list", all: true });
    expect(out.isError).toBeFalsy();
    expect(out.structured.count).toBe(1);
    expect(out.structured.settledExcluded).toBe(1);
    expect(out.structured.truncated).toBeUndefined();
  });

  it("settled exclusion keeps the visible rows aligned to their thread ids", async () => {
    // Two children: the FIRST is settled. A filter that drops it must not
    // shift the second row's threadId.
    const other = ThreadId.make("other-thread");
    const otherShell: ChildThreadShell = {
      ...childShell,
      id: other,
      title: "Other child",
      latestTurn: { state: "running" } as never,
    };
    const deps = makeDeps({
      listChildThreadIds: () => Effect.succeed([CHILD, other]),
      loadThreadShell: (id) =>
        Effect.succeed(id === CHILD ? settledChildShell : id === other ? otherShell : undefined),
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.count).toBe(1);
    const row = (out.structured.threads as Array<Record<string, unknown>>)[0]!;
    expect(row.threadId).toBe(other);
    expect(row.state).toBe("running");
  });
});

describe("children tool — sweep (GHE #304)", () => {
  it("requires a target form", async () => {
    const out = await run(makeDeps(), { op: "sweep" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("thread_ids");
    expect(out.text).toContain("all_older_than_hours");
  });

  it("settles explicit terminal ids and skips others with per-thread reasons", async () => {
    const foreign = ThreadId.make("foreign-thread");
    const running = ThreadId.make("running-thread");
    const deps = makeDeps({
      loadThreadDetail: (id) =>
        Effect.succeed(
          id === CHILD
            ? childDetail
            : id === foreign
              ? { ...childDetail, id: foreign, projectId: ProjectId.make("other-project") }
              : id === running
                ? {
                    ...childDetail,
                    id: running,
                    session: { status: "running" } as never,
                    latestTurn: { state: "running" } as never,
                  }
                : undefined,
        ),
    });
    const out = await run(deps, {
      op: "sweep",
      thread_ids: [CHILD, foreign, running, "missing-thread"],
    });
    expect(out.isError).toBeFalsy();
    expect(out.structured.settled).toEqual([CHILD]);
    expect(out.structured.settledCount).toBe(1);
    expect(deps.__settled).toEqual([CHILD]);
    const skipped = out.structured.skipped as Array<Record<string, unknown>>;
    expect(skipped.map((s) => s.reason).sort()).toEqual(
      [
        "in a different project",
        "state is 'running', not terminal — only completed/failed/aborted threads can be swept",
        "thread not found",
      ].sort(),
    );
  });

  it("all_older_than_hours settles this thread's old terminal children only", async () => {
    // Base fixtures: CHILD's last activity is 10m before nowIso (00:20 − 00:10).
    const deps = makeDeps();
    const settledAll = await run(deps, { op: "sweep", all_older_than_hours: 0.1 }); // 6m
    expect(settledAll.isError).toBeFalsy();
    expect(settledAll.structured.settled).toEqual([CHILD]);

    const deps2 = makeDeps();
    const tooYoung = await run(deps2, { op: "sweep", all_older_than_hours: 1 }); // 60m
    expect(tooYoung.isError).toBeFalsy();
    expect(tooYoung.structured.settledCount).toBe(0);
    expect(tooYoung.structured.hint).toContain("Verify each child's state");
    expect(deps2.__settled).toEqual([]);
  });

  it("never force-settles a running child via all_older_than_hours", async () => {
    const deps = makeDeps({
      loadThreadShell: (id) =>
        Effect.succeed(
          id === CHILD
            ? {
                ...childShell,
                session: { status: "running" } as never,
                latestTurn: { state: "running" } as never,
              }
            : undefined,
        ),
    });
    const out = await run(deps, { op: "sweep", all_older_than_hours: 0.1 });
    expect(out.isError).toBeFalsy();
    expect(out.structured.settledCount).toBe(0);
    const skipped = out.structured.skipped as Array<Record<string, unknown>>;
    expect(skipped[0]!.threadId).toBe(CHILD);
    expect(skipped[0]!.reason).toContain("state is 'running'");
  });
});

describe("children tool — drain (inter-agent mailbox)", () => {
  it("drains the caller's own mailbox with no arguments", async () => {
    const out = await run(makeDeps(), { op: "drain" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.ok).toBe(true);
    expect(out.structured.threadId).toBe(CALLER);
    expect(out.structured.state).toBe("dispatched");
    expect(out.structured.delivered).toBe(1);
    expect(out.structured.subjects).toEqual(["Subject A"]);
  });

  it("reports queued and held states through verbatim", async () => {
    const queued = await run(
      makeDeps({
        drainOwnMailbox: () =>
          Effect.succeed({
            state: "queued" as const,
            queued: 2,
            subjects: ["a", "b"],
            note: "mid-turn",
          }),
      }),
      { op: "drain" },
    );
    expect(queued.isError).toBeFalsy();
    expect(queued.structured.state).toBe("queued");
    expect(queued.structured.queued).toBe(2);
    expect(queued.structured.note).toBe("mid-turn");

    const held = await run(
      makeDeps({
        drainOwnMailbox: () =>
          Effect.succeed({
            state: "held" as const,
            held: 1,
            subjects: ["a"],
            note: "suppressed",
          }),
      }),
      { op: "drain" },
    );
    expect(held.structured.state).toBe("held");
    expect(held.structured.note).toBe("suppressed");
  });

  it("rejects arguments — drain takes none", async () => {
    const out = await run(makeDeps(), { op: "drain", thread_id: CHILD });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("takes no arguments");
  });

  it("surfaces a missing mailbox as an error, not a silent no-op", async () => {
    const out = await run(
      makeDeps({
        drainOwnMailbox: () => Effect.fail("inter-agent mailbox is not available in this host"),
      }),
      { op: "drain" },
    );
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Drain failed");
    expect(out.text).toContain("not available");
  });
});
