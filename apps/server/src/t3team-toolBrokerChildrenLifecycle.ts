/**
 * Mutating ops for `t3team.thread.children` (GHE #55): `wait` (durably register
 * a wait that resumes this turn on the child's terminal event or a timeout),
 * `stop` (halt a child's running turn), and `close` (mark a child done from
 * this side — bookkeeping once its final report has arrived).
 *
 * @module t3team-toolBrokerChildrenLifecycle
 */
import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import { loadTarget, opUsage, readString } from "./t3team-toolBrokerChildrenShared.ts";
import {
  T3TEAM_CHILD_WAIT_OUTCOMES,
  type ChildrenArgs,
  type T3TeamChildWaitOutcome,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

export function opWait(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const threadId = readString(args.thread_id);
  if (!threadId) {
    return Effect.succeed(errorResult(`${opUsage("wait")} — 'thread_id' is required.`));
  }
  const on: T3TeamChildWaitOutcome =
    args.on === undefined ? "terminal" : (args.on as T3TeamChildWaitOutcome);
  if (!(T3TEAM_CHILD_WAIT_OUTCOMES as readonly string[]).includes(on)) {
    return Effect.succeed(
      errorResult(
        `children({ op: "wait" }) 'on' must be one of: ${T3TEAM_CHILD_WAIT_OUTCOMES.join(", ")} (got '${String(args.on)}').`,
      ),
    );
  }
  let timeoutMs: number | undefined;
  if (args.timeout !== undefined) {
    if (typeof args.timeout !== "number" || !Number.isFinite(args.timeout) || args.timeout <= 0) {
      return Effect.succeed(
        errorResult(
          `children({ op: "wait" }) 'timeout' must be a positive number of milliseconds.`,
        ),
      );
    }
    timeoutMs = Math.floor(args.timeout);
  }

  return loadTarget(deps, threadId).pipe(
    Effect.flatMap((detail) => {
      const nowIso = deps.nowIso();
      const waitId = deps.newId();
      const deadlineIso =
        timeoutMs !== undefined
          ? DateTime.formatIso(
              DateTime.add(DateTime.makeUnsafe(nowIso), { milliseconds: timeoutMs }),
            )
          : undefined;
      const payload = {
        waitId,
        childThreadId: detail.id,
        childTitle: detail.title,
        on,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(deadlineIso ? { deadlineIso } : {}),
      };
      return deps
        .appendActivity(deps.callerThreadId, {
          kind: "t3team.child_wait.registered",
          summary: `Waiting for ${detail.title} to reach ${on}`,
          payload,
        })
        .pipe(
          Effect.map(() =>
            okResult({
              ok: true,
              status: "waiting",
              waitId,
              childThreadId: detail.id,
              childTitle: detail.title,
              on,
              ...(deadlineIso ? { deadlineIso } : {}),
              note: "This turn will resume when the child reaches a terminal state (or the timeout). A dead child resolves as failed.",
            }),
          ),
          Effect.catch((error) =>
            Effect.succeed(errorResult(`Failed to register the child wait: ${error}`)),
          ),
        );
    }),
    Effect.catch((error) => Effect.succeed(errorResult(error))),
  );
}

export function opStop(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const threadId = readString(args.thread_id);
  if (!threadId) {
    return Effect.succeed(errorResult(`${opUsage("stop")} — 'thread_id' is required.`));
  }
  return loadTarget(deps, threadId).pipe(
    Effect.flatMap((detail) =>
      deps.interruptTurn(ThreadId.make(threadId)).pipe(
        Effect.map(() =>
          okResult({
            ok: true,
            stopped: true,
            threadId: detail.id,
            title: detail.title,
            ...(typeof args.reason === "string" && args.reason.trim()
              ? { reason: args.reason.trim() }
              : {}),
          }),
        ),
        Effect.catch((error) => Effect.succeed(errorResult(`Failed to stop the thread: ${error}`))),
      ),
    ),
    Effect.catch((error) => Effect.succeed(errorResult(error))),
  );
}

export function opClose(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  const threadId = readString(args.thread_id);
  if (!threadId) {
    return Effect.succeed(errorResult(`${opUsage("close")} — 'thread_id' is required.`));
  }
  return loadTarget(deps, threadId).pipe(
    Effect.flatMap((detail) =>
      deps
        .appendActivity(deps.callerThreadId, {
          kind: "t3team.child.closed",
          summary: `Marked ${detail.title} as closed`,
          payload: { childThreadId: detail.id },
        })
        .pipe(
          Effect.map(() =>
            okResult({
              ok: true,
              closed: true,
              threadId: detail.id,
              title: detail.title,
            }),
          ),
          Effect.catch((error) =>
            Effect.succeed(errorResult(`Failed to close the child: ${error}`)),
          ),
        ),
    ),
    Effect.catch((error) => Effect.succeed(errorResult(error))),
  );
}
