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
    appendActivity: (threadId, input) =>
      Effect.sync(() => {
        appended.push({ threadId, kind: input.kind, payload: input.payload });
      }),
    interruptTurn: (threadId) => Effect.sync(() => interrupted.push(threadId)),
    settleThread: (threadId) => Effect.sync(() => settled.push(threadId)),
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
