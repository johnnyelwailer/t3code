/**
 * `watch` / `unwatch` ops for `t3team.thread.children` (GHE #63): durably
 * register / cancel a per-subscription silence watch on a target thread.
 *
 * @module t3team-toolBrokerChildrenWatch
 */
import * as Effect from "effect/Effect";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import { loadTarget, opUsage, readString } from "./t3team-toolBrokerChildrenShared.ts";
import {
  THREAD_SILENCE_DEFAULT_TIMEOUT_MS,
  THREAD_SILENCE_WATCH_CANCELLED_KIND,
  THREAD_SILENCE_WATCH_REGISTERED_KIND,
} from "./t3team-threadSilenceWatch.ts";
import {
  type ChildrenArgs,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

export function opWatch(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const threadId = readString(args.thread_id);
  if (!threadId) {
    return Effect.succeed(errorResult(`${opUsage("watch")} — 'thread_id' is required.`));
  }
  let timeoutMs = THREAD_SILENCE_DEFAULT_TIMEOUT_MS;
  if (args.timeout !== undefined) {
    if (typeof args.timeout !== "number" || !Number.isFinite(args.timeout) || args.timeout <= 0) {
      return Effect.succeed(
        errorResult(
          `children({ op: "watch" }) 'timeout' must be a positive number of milliseconds.`,
        ),
      );
    }
    timeoutMs = Math.floor(args.timeout);
  }

  return loadTarget(deps, threadId).pipe(
    Effect.flatMap((detail) => {
      const watchId = deps.newId();
      const payload = {
        watchId,
        targetThreadId: detail.id,
        targetTitle: detail.title,
        timeoutMs,
      };
      return deps
        .appendActivity(deps.callerThreadId, {
          kind: THREAD_SILENCE_WATCH_REGISTERED_KIND,
          summary: `Watching ${detail.title} for silence (${Math.round(timeoutMs / 1000)}s)`,
          payload,
        })
        .pipe(
          Effect.map(() =>
            okResult({
              ok: true,
              status: "watching",
              watchId,
              targetThreadId: detail.id,
              targetTitle: detail.title,
              timeoutMs,
              note:
                "This thread will be notified when the target has had no activity for that long, " +
                "re-notified at each multiple of the timeout while it stays silent. The notification " +
                "flags whether a tool call was still in progress (legitimate long operation vs. the " +
                "real stuck signal). If the target reaches a terminal state the watch closes with a " +
                "stopped note. Cancel with children({ op: 'unwatch', thread_id }).",
            }),
          ),
          Effect.catch((error) =>
            Effect.succeed(errorResult(`Failed to register the silence watch: ${error}`)),
          ),
        );
    }),
    Effect.catch((error) => Effect.succeed(errorResult(error))),
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
  return loadTarget(deps, threadId).pipe(
    Effect.flatMap((detail) =>
      deps
        .appendActivity(deps.callerThreadId, {
          kind: THREAD_SILENCE_WATCH_CANCELLED_KIND,
          summary: `Stopped watching ${detail.title} for silence`,
          payload: { targetThreadId: detail.id },
        })
        .pipe(
          Effect.map(() =>
            okResult({
              ok: true,
              status: "unwatched",
              targetThreadId: detail.id,
              targetTitle: detail.title,
              note: "All silence watches this thread had on that thread are cancelled.",
            }),
          ),
          Effect.catch((error) =>
            Effect.succeed(errorResult(`Failed to cancel the silence watch: ${error}`)),
          ),
        ),
    ),
    Effect.catch((error) => Effect.succeed(errorResult(error))),
  );
}
