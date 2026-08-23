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
  const base: T3TeamChildrenToolDeps = {
    callerThreadId: CALLER,
    callerProjectId: PROJECT,
    loadThreadDetail: (id) =>
      Effect.succeed(id === CALLER ? callerDetail : id === CHILD ? childDetail : undefined),
    loadThreadShell: (id) =>
      Effect.succeed(id === CALLER ? childShell : id === CHILD ? childShell : undefined),
    listProjectThreadShells: () => Effect.succeed([childShell]),
    appendActivity: (threadId, input) =>
      Effect.sync(() => {
        appended.push({ threadId, kind: input.kind, payload: input.payload });
      }),
    interruptTurn: (threadId) => Effect.sync(() => interrupted.push(threadId)),
    nowIso: () => "2026-01-01T00:20:00.000Z",
    newId: () => "wait-1",
    ...overrides,
  };
  return { ...base, __appended: appended, __interrupted: interrupted };
}

interface TestDeps extends T3TeamChildrenToolDeps {
  __appended: Array<{ threadId: string; kind: string; payload: unknown }>;
  __interrupted: string[];
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
    });
    const out = await run(deps, { op: "list" });
    expect(out.isError).toBeFalsy();
    expect(out.structured.count).toBe(0);
    expect(out.structured.hint).toContain("t3team_start_child");
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
