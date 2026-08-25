/**
 * `t3team.thread.children` — ONE meta tool for managing this thread's child
 * sessions, selected by an `op` parameter (GHE #55).
 *
 * The design is deliberately a single tool with an `op` discriminator rather
 * than five tools: the context cost is one compact description (op vocabulary +
 * one line each) no matter how many ops exist, and per-op detail is discovered
 * on demand via `help` or carried in a malformed call's error message.
 *
 * This tool is STATE, not content: child→parent content still flows through
 * `send_message`. Read-only state (list/status) is derived by the shared
 * `deriveThreadRunStatus` primitive (packages/shared/threadRunStatus) — the same
 * source the sidebar needs (#52). `wait` is a DURABLE wait (a registered
 * activity + a reactor that resolves it on the child's terminal event or a
 * timeout), not a poll loop; see t3team-childWait.ts.
 *
 * Ops:
 *   list   — this thread's children with live state (`all: true` = whole project)
 *   status — one child's current turn state, in-progress work, elapsed, activity tail
 *   wait   — durably resume this turn when a child reaches a terminal state
 *   watch  — silence-watch a thread: notified when it has no activity for a
 *            per-subscription timeout (GHE #63); re-notified at each multiple
 *   unwatch — cancel all silence watches this thread has on the target
 *   stop   — halt a child's running turn
 *   close  — mark a child done from this side (bookkeeping)
 *   help   — the exact schema for one op
 *
 * This module is the entry point: it validates the `op` and dispatches to the
 * op implementations in the sibling modules.
 *
 * @module t3team-toolBrokerChildren
 */
import * as Effect from "effect/Effect";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import { opUsage, readString } from "./t3team-toolBrokerChildrenShared.ts";
import { opList, opStatus } from "./t3team-toolBrokerChildrenStatus.ts";
import {
  opClose,
  opStop,
  opUnwatch,
  opWatch,
  opWait,
} from "./t3team-toolBrokerChildrenLifecycle.ts";
import {
  T3TEAM_CHILD_OPS,
  T3TEAM_CHILDREN_TOOL_ID,
  type ChildrenArgs,
  type T3TeamChildOp,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

export {
  T3TEAM_CHILD_OPS,
  T3TEAM_CHILD_WAIT_OUTCOMES,
  T3TEAM_CHILDREN_TOOL_ID,
  type ChildThreadActivity,
  type ChildThreadDetail,
  type ChildThreadMessage,
  type ChildThreadShell,
  type ChildrenArgs,
  type T3TeamChildOp,
  type T3TeamChildWaitOutcome,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
export type { ThreadRunState } from "./t3team-toolBrokerChildrenTypes.ts";

function opHelp(args: ChildrenArgs): T3TeamToolCallResult {
  const opName = readString(args.op_name);
  if (opName !== undefined && !(T3TEAM_CHILD_OPS as readonly string[]).includes(opName)) {
    return errorResult(opUsage(opName));
  }
  if (opName !== undefined) {
    return okResult({ ok: true, op: opName, usage: opUsage(opName) });
  }
  return okResult({
    ok: true,
    ops: Object.fromEntries(T3TEAM_CHILD_OPS.map((op) => [op, opUsage(op)])),
  });
}

export function callT3TeamChildrenTool(input: {
  readonly toolArgs: unknown;
  readonly deps: T3TeamChildrenToolDeps;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { toolArgs, deps } = input;
  const args = (toolArgs ?? {}) as ChildrenArgs;
  const op = readString(args.op);
  if (!op) {
    return Effect.succeed(
      errorResult(
        `${T3TEAM_CHILDREN_TOOL_ID} requires an 'op'. Valid ops: ${T3TEAM_CHILD_OPS.join(", ")}. ` +
          `Call children({ op: "help" }) for per-op schemas.`,
      ),
    );
  }
  if (!(T3TEAM_CHILD_OPS as readonly string[]).includes(op)) {
    return Effect.succeed(errorResult(opUsage(op)));
  }

  switch (op as T3TeamChildOp) {
    case "help":
      return Effect.succeed(opHelp(args));
    case "list":
      return opList(deps, args);
    case "status":
      return opStatus(deps, args);
    case "wait":
      return opWait(deps, args);
    case "watch":
      return opWatch(deps, args);
    case "unwatch":
      return opUnwatch(deps, args);
    case "stop":
      return opStop(deps, args);
    case "close":
      return opClose(deps, args);
    default:
      return Effect.succeed(errorResult(opUsage(op)));
  }
}
