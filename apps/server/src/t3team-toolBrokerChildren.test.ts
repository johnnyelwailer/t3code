/**
 * `t3team.thread.children` after the V2 port: only the ops without an upstream
 * equivalent remain (watch / unwatch / sweep / drain / environments / help);
 * removed ops answer with the upstream tool that replaced them.
 */
import { assert, describe, it } from "@effect/vitest";
import { ProjectId, ThreadId, type OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { callT3TeamChildrenTool } from "./t3team-toolBrokerChildren.ts";
import type {
  ChildrenSilenceWatchPort,
  T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";

const caller = ThreadId.make("thread:caller");
const project = ProjectId.make("project:a");
const NOW = "2026-10-03T12:00:00.000Z";

const shell = (input: {
  readonly id: string;
  readonly status?: OrchestrationV2ThreadShell["status"];
  readonly parent?: string | null;
  readonly projectId?: string;
  readonly finishedHoursAgo?: number;
  readonly settled?: boolean;
}): OrchestrationV2ThreadShell =>
  ({
    id: ThreadId.make(input.id),
    projectId: ProjectId.make(input.projectId ?? project),
    title: `Title ${input.id}`,
    status: input.status ?? "completed",
    activityRunStatus: null,
    pendingBackgroundTasks: [],
    lineage: {
      parentThreadId: input.parent === undefined ? caller : input.parent,
      relationshipToParent: "subagent",
      rootThreadId: caller,
    },
    latestRunCompletedAt: DateTime.makeUnsafe(
      Date.parse(NOW) - (input.finishedHoursAgo ?? 1) * 3_600_000,
    ),
    updatedAt: DateTime.makeUnsafe(Date.parse(NOW)),
    settledOverride: input.settled ? "settled" : null,
  }) as unknown as OrchestrationV2ThreadShell;

const makeDeps = (
  shells: ReadonlyArray<OrchestrationV2ThreadShell>,
  overrides: Partial<T3TeamChildrenToolDeps> = {},
) => {
  const settled: Array<string> = [];
  const deps: T3TeamChildrenToolDeps = {
    callerThreadId: caller,
    callerProjectId: project,
    localEnvironmentId: "env-local",
    loadThreadShell: (threadId) => Effect.succeed(shells.find((entry) => entry.id === threadId)),
    listProjectThreadShells: () => Effect.succeed(shells),
    settleThread: (threadId) =>
      threadId === "thread:refuses"
        ? Effect.fail("thread has a live child")
        : Effect.sync(() => void settled.push(threadId)),
    listEnvironmentBindings: () => Effect.succeed([]),
    drainOwnMailbox: undefined,
    silenceWatch: undefined,
    nowIso: () => NOW,
    ...overrides,
  };
  return { deps, settled };
};

const call = (deps: T3TeamChildrenToolDeps, toolArgs: unknown) =>
  callT3TeamChildrenTool({ toolArgs, deps }).pipe(
    Effect.map((result) => ({
      isError: result.isError === true,
      payload: result.structuredContent as Record<string, unknown>,
      text: result.content[0]?.text ?? "",
    })),
  );

describe("t3team children tool", () => {
  it.effect("requires an op, lists the remaining ops in help, and redirects removed ops", () =>
    Effect.gen(function* () {
      const { deps } = makeDeps([]);
      const missing = yield* call(deps, {});
      assert.isTrue(missing.isError);
      assert.include(missing.text, "watch, unwatch, sweep, drain, environments, help");

      const help = yield* call(deps, { op: "help" });
      assert.deepEqual(Object.keys(help.payload.ops as object), [
        "watch",
        "unwatch",
        "sweep",
        "drain",
        "environments",
        "help",
      ]);

      for (const [op, replacement] of [
        ["wait", "delegate_task mode:'wait'"],
        ["status", "task_status"],
        ["stop", "task_cancel"],
        ["list", "t3_thread_list"],
      ] as const) {
        const removed = yield* call(deps, { op });
        assert.isTrue(removed.isError);
        assert.include(removed.text, `op '${op}' was removed`);
        assert.include(removed.text, replacement);
      }
    }),
  );

  it.effect("sweeps explicit finished threads and skips running, missing and foreign ones", () =>
    Effect.gen(function* () {
      const { deps, settled } = makeDeps([
        shell({ id: "thread:done" }),
        shell({ id: "thread:failed", status: "failed" }),
        shell({ id: "thread:busy", status: "running" }),
        shell({ id: "thread:foreign", projectId: "project:b" }),
        shell({ id: "thread:refuses" }),
      ]);
      const result = yield* call(deps, {
        op: "sweep",
        thread_ids: [
          "thread:done",
          "thread:failed",
          "thread:busy",
          "thread:foreign",
          "thread:gone",
          "thread:refuses",
        ],
      });
      assert.isFalse(result.isError);
      assert.deepEqual(settled, ["thread:done", "thread:failed"]);
      const skipped = (result.payload.skipped as Array<{ threadId: string }>).map(
        (entry) => entry.threadId,
      );
      assert.deepEqual(skipped, ["thread:busy", "thread:foreign", "thread:gone"]);
      assert.deepEqual(result.payload.errors, [
        { threadId: "thread:refuses", error: "thread has a live child" },
      ]);
    }),
  );

  it.effect("sweeps only this thread's finished children older than the cutoff", () =>
    Effect.gen(function* () {
      const { deps, settled } = makeDeps([
        shell({ id: "thread:old-child", finishedHoursAgo: 30 }),
        shell({ id: "thread:recent-child", finishedHoursAgo: 2 }),
        shell({ id: "thread:old-settled", finishedHoursAgo: 30, settled: true }),
        shell({ id: "thread:old-other", finishedHoursAgo: 30, parent: "thread:someone-else" }),
        shell({ id: "thread:old-top", finishedHoursAgo: 30, parent: null }),
      ]);
      const result = yield* call(deps, { op: "sweep", all_older_than_hours: 24 });
      assert.deepEqual(settled, ["thread:old-child"]);
      assert.strictEqual(result.payload.settledCount, 1);

      const invalid = yield* call(deps, { op: "sweep" });
      assert.isTrue(invalid.isError);
      assert.include(invalid.text, "pass 'thread_ids'");
    }),
  );

  it.effect("drains through the mailbox port and rejects arguments", () =>
    Effect.gen(function* () {
      const unavailable = yield* call(makeDeps([]).deps, { op: "drain" });
      assert.isTrue(unavailable.isError);
      assert.include(unavailable.text, "not available");

      const { deps } = makeDeps([], {
        drainOwnMailbox: () =>
          Effect.succeed({ state: "dispatched", delivered: 2, subjects: ["a", "b"] }),
      });
      const drained = yield* call(deps, { op: "drain" });
      assert.deepEqual(drained.payload, {
        ok: true,
        threadId: caller,
        state: "dispatched",
        delivered: 2,
        subjects: ["a", "b"],
      });
      const withArgs = yield* call(deps, { op: "drain", thread_id: "thread:x" });
      assert.isTrue(withArgs.isError);
      assert.include(withArgs.text, "takes no arguments");
    }),
  );

  it.effect("watches same-project threads through the silence-watch port", () =>
    Effect.gen(function* () {
      const registered: Array<unknown> = [];
      const port: ChildrenSilenceWatchPort = {
        register: (input) =>
          Effect.sync(() => {
            registered.push(input);
            return { watchId: "watch-1", timeoutMs: input.timeoutMs ?? 900_000 };
          }),
        cancel: () => Effect.succeed({ cancelled: 1 }),
      };
      const { deps } = makeDeps(
        [shell({ id: "thread:child" }), shell({ id: "thread:foreign", projectId: "project:b" })],
        { silenceWatch: port },
      );
      const watched = yield* call(deps, {
        op: "watch",
        thread_id: "thread:child",
        timeout: 60_000.7,
      });
      assert.include(watched.payload, { ok: true, watchId: "watch-1", timeoutMs: 60_000 });
      assert.deepEqual(registered, [
        {
          watcherThreadId: caller,
          targetThreadId: "thread:child",
          targetTitle: "Title thread:child",
          timeoutMs: 60_000,
        },
      ]);
      const foreign = yield* call(deps, { op: "watch", thread_id: "thread:foreign" });
      assert.isTrue(foreign.isError);
      assert.include(foreign.text, "different project");
      const badTimeout = yield* call(deps, { op: "watch", thread_id: "thread:child", timeout: -1 });
      assert.isTrue(badTimeout.isError);
      const unwatched = yield* call(deps, { op: "unwatch", thread_id: "thread:child" });
      assert.include(unwatched.payload, { ok: true, cancelled: 1 });

      const unavailable = yield* call(makeDeps([shell({ id: "thread:child" })]).deps, {
        op: "watch",
        thread_id: "thread:child",
      });
      assert.include(unavailable.text, "not available");
    }),
  );
});
