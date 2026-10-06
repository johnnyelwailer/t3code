/**
 * The thread silence watch on V2: register / cancel (the `t3_task_ops`
 * watch port), the live domain-event path (activity + prompt stop detection)
 * and the durable sweep (silence breaches, stop backstop, restart rehydrate).
 *
 * The open watches live in the fork table (the sweep re-reads it, so nothing
 * is replayed after a restart); per-target activity is in memory and seeded
 * from the projection whenever a target is first evaluated
 * (`t3team-threadSilenceWatchEvaluate.ts`). All watch mutations run under one
 * permit; the mailbox notices never take a thread lock.
 *
 * @module t3team-threadSilenceWatchReactor
 */
import type { OrchestrationV2DomainEvent, ThreadId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

import { THREAD_SILENCE_DEFAULT_TIMEOUT_MS } from "./t3team-threadSilenceWatch.ts";
import { makeSilenceActivityTracker } from "./t3team-threadSilenceWatchActivity.ts";
import {
  makeSilenceWatchEvaluator,
  type ThreadSilenceWatchCoreDeps,
} from "./t3team-threadSilenceWatchEvaluate.ts";
import type { T3TeamThreadSilenceWatchStoreError } from "./t3team-threadSilenceWatchStore.ts";

export type {
  SilenceWatchShell,
  ThreadSilenceWatchCoreDeps,
} from "./t3team-threadSilenceWatchEvaluate.ts";

const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

const storeFailure = (error: T3TeamThreadSilenceWatchStoreError) =>
  `the silence watch store failed (${error.operation})`;

export const makeThreadSilenceWatchCore = (deps: ThreadSilenceWatchCoreDeps) =>
  Effect.gen(function* () {
    const tracker = makeSilenceActivityTracker();
    const permit = yield* Semaphore.make(1);
    const watchedTargets = new Set<string>();
    const watchers = new Set<string>();
    const evaluateTarget = makeSilenceWatchEvaluator(deps, tracker, watchedTargets);

    const evaluateStoredTarget = (targetThreadId: string) =>
      Effect.gen(function* () {
        const records = yield* deps.store.listForTarget(targetThreadId);
        yield* evaluateTarget(targetThreadId, records, yield* Clock.currentTimeMillis);
      });

    /** Re-reads every open watch: drops a gone watcher's watches, then evaluates each target. */
    const sweep = Effect.gen(function* () {
      const nowMs = yield* Clock.currentTimeMillis;
      let open = yield* deps.store.listOpen;
      for (const watcherThreadId of new Set(open.map((record) => record.watcherThreadId))) {
        const watcher = yield* deps.loadShell(watcherThreadId);
        if (watcher !== null && watcher.settledAt === null) continue;
        yield* deps.store.removeByWatcher(watcherThreadId);
        open = open.filter((record) => record.watcherThreadId !== watcherThreadId);
      }
      const byTarget = Map.groupBy(open, (record) => record.targetThreadId);
      watchers.clear();
      for (const record of open) watchers.add(record.watcherThreadId);
      watchedTargets.clear();
      for (const targetThreadId of byTarget.keys()) watchedTargets.add(targetThreadId);
      tracker.retain(watchedTargets);
      for (const [targetThreadId, records] of byTarget) {
        yield* evaluateTarget(targetThreadId, records, nowMs);
      }
    }).pipe(permit.withPermits(1));

    const handleEvent = (event: OrchestrationV2DomainEvent) => {
      tracker.note(event);
      const threadId = event.threadId;
      if (event.type === "run.updated") {
        if (!TERMINAL_RUN_STATUSES.has(event.payload.status) || !watchedTargets.has(threadId)) {
          return Effect.void;
        }
        return evaluateStoredTarget(threadId).pipe(permit.withPermits(1));
      }
      if (event.type !== "thread.deleted" && event.type !== "thread.settled") return Effect.void;
      if (!watchers.has(threadId) && !watchedTargets.has(threadId)) return Effect.void;
      return Effect.gen(function* () {
        // A deleted or settled thread's own watches die with it, silently.
        if (watchers.delete(threadId)) yield* deps.store.removeByWatcher(threadId);
        if (watchedTargets.has(threadId)) yield* evaluateStoredTarget(threadId);
      }).pipe(permit.withPermits(1));
    };

    const register = (input: {
      readonly watcherThreadId: ThreadId;
      readonly targetThreadId: ThreadId;
      readonly targetTitle: string;
      readonly timeoutMs: number | undefined;
    }) =>
      Effect.gen(function* () {
        if (input.watcherThreadId === input.targetThreadId) {
          return yield* Effect.fail("A thread cannot watch itself.");
        }
        const record = yield* deps.store.upsert({
          watchId: deps.newWatchId(),
          watcherThreadId: input.watcherThreadId,
          targetThreadId: input.targetThreadId,
          targetTitle: input.targetTitle,
          timeoutMs: input.timeoutMs ?? THREAD_SILENCE_DEFAULT_TIMEOUT_MS,
          createdAt: DateTime.formatIso(yield* DateTime.now),
        });
        watchers.add(record.watcherThreadId);
        // An already-stopped target reports (once per episode) and closes right away.
        yield* evaluateStoredTarget(record.targetThreadId);
        return { watchId: record.watchId, timeoutMs: record.timeoutMs };
      }).pipe(
        Effect.mapError((error) => (typeof error === "string" ? error : storeFailure(error))),
        permit.withPermits(1),
      );

    const cancel = (input: {
      readonly watcherThreadId: ThreadId;
      readonly targetThreadId: ThreadId;
    }) =>
      Effect.gen(function* () {
        const cancelled = yield* deps.store.cancel(input);
        const remaining = yield* deps.store.listForTarget(input.targetThreadId);
        if (remaining.length === 0) {
          watchedTargets.delete(input.targetThreadId);
          tracker.forget(input.targetThreadId);
        }
        return { cancelled };
      }).pipe(Effect.mapError(storeFailure), permit.withPermits(1));

    return { register, cancel, handleEvent, sweep };
  });

export type ThreadSilenceWatchCore = Effect.Success<ReturnType<typeof makeThreadSilenceWatchCore>>;
