/**
 * `watch` / `unwatch` ops for `t3team.thread.children`: register or cancel a
 * per-subscription silence watch on a same-project thread through the
 * silence-watch layer's port (durability and notification live there).
 *
 * @module t3team-toolBrokerChildrenWatch
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { loadTarget, opUsage, readString } from "./t3team-toolBrokerChildrenShared.ts";
import {
  type ChildrenArgs,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

const UNAVAILABLE = "Silence watches are not available in this runtime.";

export function opWatch(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const threadId = readString(args.thread_id);
  if (!threadId) {
    return Effect.succeed(errorResult(`${opUsage("watch")} — 'thread_id' is required.`));
  }
  const timeout = args.timeout;
  if (
    timeout !== undefined &&
    (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0)
  ) {
    return Effect.succeed(
      errorResult(`children({ op: "watch" }) 'timeout' must be a positive number of milliseconds.`),
    );
  }
  const port = deps.silenceWatch;
  if (port === undefined) return Effect.succeed(errorResult(UNAVAILABLE));
  return loadTarget(deps, threadId).pipe(
    Effect.flatMap((target) =>
      port.register({
        watcherThreadId: deps.callerThreadId,
        targetThreadId: target.id,
        targetTitle: target.title,
        timeoutMs: typeof timeout === "number" ? Math.floor(timeout) : undefined,
      }),
    ),
    Effect.map((registered) =>
      okResult({
        ok: true,
        op: "watch",
        threadId,
        watchId: registered.watchId,
        timeoutMs: registered.timeoutMs,
      }),
    ),
    Effect.catch((error) => Effect.succeed(errorResult(`Watch failed: ${error}`))),
  );
}

export function opUnwatch(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const threadId = readString(args.thread_id);
  if (!threadId) {
    return Effect.succeed(errorResult(`${opUsage("unwatch")} — 'thread_id' is required.`));
  }
  const port = deps.silenceWatch;
  if (port === undefined) return Effect.succeed(errorResult(UNAVAILABLE));
  return port
    .cancel({ watcherThreadId: deps.callerThreadId, targetThreadId: ThreadId.make(threadId) })
    .pipe(
      Effect.map(({ cancelled }) => okResult({ ok: true, op: "unwatch", threadId, cancelled })),
      Effect.catch((error) => Effect.succeed(errorResult(`Unwatch failed: ${error}`))),
    );
}
