/**
 * `watch` / `unwatch` ops for `t3team.thread.children` (GHE #63): the watch op
 * is an upsert per (watcher, target) - a re-watch durably cancels any still
 * pending watch of the caller on the same target, so a terminal stop notifies
 * ONCE per watcher instead of once per historical watch.
 */
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  THREAD_SILENCE_WATCH_CANCELLED_KIND,
  THREAD_SILENCE_WATCH_REGISTERED_KIND,
} from "./t3team-threadSilenceWatch.ts";
import { opUnwatch, opWatch } from "./t3team-toolBrokerChildrenWatch.ts";
import {
  type ChildrenArgs,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";

const CALLER = ThreadId.make("parent-1");
const TARGET = ThreadId.make("child-1");

interface AppendedActivity {
  readonly threadId: string;
  readonly kind: string;
  readonly summary: string;
  readonly payload: unknown;
}

const registeredActivity = (targetThreadId: string) => ({
  kind: THREAD_SILENCE_WATCH_REGISTERED_KIND,
  summary: `Watching QA child for silence (900s)`,
  payload: { watchId: "w1", targetThreadId, targetTitle: "QA child", timeoutMs: 900_000 },
});

const cancelledActivity = (targetThreadId: string) => ({
  kind: THREAD_SILENCE_WATCH_CANCELLED_KIND,
  summary: "Stopped watching QA child for silence",
  payload: { targetThreadId },
});

function makeDeps(callerActivities: Array<{ kind: string; payload: unknown }> = []) {
  const appended: AppendedActivity[] = [];
  const deps = {
    callerThreadId: CALLER,
    callerProjectId: ProjectId.make("project-1"),
    loadThreadDetail: (threadId: unknown) =>
      Effect.succeed(
        threadId === TARGET
          ? ({
              id: TARGET,
              projectId: "project-1",
              title: "QA child",
              activities: [],
              messages: [],
            } as const)
          : ({
              id: CALLER,
              projectId: "project-1",
              title: "Parent",
              activities: callerActivities,
              messages: [],
            } as const),
      ),
    loadThreadShell: () => Effect.void,
    listProjectThreadShells: () => Effect.succeed([]),
    listChildThreadIds: () => Effect.succeed([]),
    listParentChildRelations: () => Effect.succeed([]),
    appendActivity: (
      threadId: unknown,
      activity: { kind: string; summary: string; payload: unknown },
    ) =>
      Effect.sync(() => {
        appended.push({ ...activity, threadId: String(threadId) });
      }),
    interruptTurn: () => Effect.void,
    settleThread: () => Effect.void,
    drainOwnMailbox: () =>
      Effect.succeed({ state: "dispatched" as const, delivered: 0, subjects: [] }),
    nowIso: () => "2026-01-01T00:00:00.000Z",
    newId: () => "w-new",
  } as unknown as T3TeamChildrenToolDeps;
  return { deps, appended };
}

const watchArgs = (over: Partial<ChildrenArgs> = {}): ChildrenArgs =>
  ({ op: "watch", thread_id: "child-1", ...over }) as ChildrenArgs;

const resultStructured = (result: { structuredContent?: unknown }) =>
  result.structuredContent as { readonly ok?: boolean; readonly watchId?: string };

describe("opWatch", () => {
  it.effect("registers the watch on first use without a spurious cancel", () =>
    Effect.gen(function* () {
      const { deps, appended } = makeDeps();
      const result = yield* opWatch(deps, watchArgs());
      expect(result.isError).toBeUndefined();
      expect(resultStructured(result)).toMatchObject({ ok: true, watchId: "w-new" });
      expect(appended.map((activity) => activity.kind)).toEqual([
        THREAD_SILENCE_WATCH_REGISTERED_KIND,
      ]);
      expect(appended[0]?.threadId).toBe("parent-1");
    }),
  );

  it.effect("supersedes a still-pending watch on the same target with a cancel", () =>
    Effect.gen(function* () {
      const { deps, appended } = makeDeps([registeredActivity("child-1")]);
      yield* opWatch(deps, watchArgs());
      expect(appended.map((activity) => activity.kind)).toEqual([
        THREAD_SILENCE_WATCH_CANCELLED_KIND,
        THREAD_SILENCE_WATCH_REGISTERED_KIND,
      ]);
      expect(appended[0]?.payload).toEqual({ targetThreadId: "child-1" });
    }),
  );

  it.effect("does not append a cancel when the previous watch was already cancelled", () =>
    Effect.gen(function* () {
      const { deps, appended } = makeDeps([
        registeredActivity("child-1"),
        cancelledActivity("child-1"),
      ]);
      yield* opWatch(deps, watchArgs());
      expect(appended.map((activity) => activity.kind)).toEqual([
        THREAD_SILENCE_WATCH_REGISTERED_KIND,
      ]);
    }),
  );

  it.effect("ignores pending watches on other targets", () =>
    Effect.gen(function* () {
      const { deps, appended } = makeDeps([registeredActivity("other-1")]);
      yield* opWatch(deps, watchArgs());
      expect(appended.map((activity) => activity.kind)).toEqual([
        THREAD_SILENCE_WATCH_REGISTERED_KIND,
      ]);
    }),
  );

  it.effect("honors a custom timeout in the registered payload", () =>
    Effect.gen(function* () {
      const { deps, appended } = makeDeps();
      yield* opWatch(deps, watchArgs({ timeout: 30_000 }));
      const registered = appended.find(
        (activity) => activity.kind === THREAD_SILENCE_WATCH_REGISTERED_KIND,
      );
      expect(registered).toBeDefined();
      expect((registered as { payload: { timeoutMs: number } }).payload.timeoutMs).toBe(30_000);
    }),
  );

  it.effect("rejects a missing thread_id", () =>
    Effect.gen(function* () {
      const { deps } = makeDeps();
      const result = yield* opWatch(deps, { op: "watch" } as ChildrenArgs);
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("thread_id");
    }),
  );
});

describe("opUnwatch", () => {
  it.effect("appends a cancel scoped to the (watcher, target) pair", () =>
    Effect.gen(function* () {
      const { deps, appended } = makeDeps();
      const result = yield* opUnwatch(deps, {
        op: "unwatch",
        thread_id: "child-1",
      } as ChildrenArgs);
      expect(result.isError).toBeUndefined();
      expect(appended.map((activity) => activity.kind)).toEqual([
        THREAD_SILENCE_WATCH_CANCELLED_KIND,
      ]);
      expect(appended[0]?.payload).toEqual({ targetThreadId: "child-1" });
    }),
  );
});
