/**
 * `t3team.thread.children` — ONE meta tool for the child-thread operations
 * upstream does not have, selected by an `op` parameter (one compact
 * description no matter how many ops exist; per-op detail via `help`).
 *
 * Ops:
 *   watch / unwatch — silence-watch a thread (notified when it goes quiet)
 *   sweep          — settle finished threads in bulk (verify first)
 *   drain          — claim THIS thread's own pending inter-agent mailbox now
 *   environments   — read-only: which environments delegate_task can target
 *   help           — the exact usage for one op
 *
 * Removed ops (list / status / wait / stop / close) answer with the upstream
 * tool that replaced them.
 *
 * @module t3team-toolBrokerChildren
 */
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { opDrain } from "./t3team-toolBrokerChildrenDrain.ts";
import { opEnvironments } from "./t3team-toolBrokerChildrenEnvironments.ts";
import { opUsage, readString } from "./t3team-toolBrokerChildrenShared.ts";
import { opSweep } from "./t3team-toolBrokerChildrenSweep.ts";
import {
  T3TEAM_CHILD_OPS,
  T3TEAM_CHILDREN_TOOL_ID,
  type ChildrenArgs,
  type T3TeamChildOp,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { opUnwatch, opWatch } from "./t3team-toolBrokerChildrenWatch.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

export type { ChildrenArgs, T3TeamChildrenToolDeps } from "./t3team-toolBrokerChildrenTypes.ts";

const isOp = (value: string): value is T3TeamChildOp =>
  (T3TEAM_CHILD_OPS as ReadonlyArray<string>).includes(value);

function opHelp(args: ChildrenArgs): T3TeamToolCallResult {
  const opName = readString(args.op_name);
  if (opName !== undefined) {
    return isOp(opName)
      ? okResult({ ok: true, op: opName, usage: opUsage(opName) })
      : errorResult(opUsage(opName));
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
  const { deps } = input;
  const args = (input.toolArgs ?? {}) as ChildrenArgs;
  const op = readString(args.op);
  if (!op) {
    return Effect.succeed(
      errorResult(
        `${T3TEAM_CHILDREN_TOOL_ID} requires an 'op'. Valid ops: ${T3TEAM_CHILD_OPS.join(", ")}. ` +
          `Call children({ op: "help" }) for per-op usage.`,
      ),
    );
  }
  if (!isOp(op)) return Effect.succeed(errorResult(opUsage(op)));
  switch (op) {
    case "help":
      return Effect.succeed(opHelp(args));
    case "watch":
      return opWatch(deps, args);
    case "unwatch":
      return opUnwatch(deps, args);
    case "sweep":
      return opSweep(deps, args);
    case "drain":
      return opDrain(deps, args);
    case "environments":
      return opEnvironments(deps);
  }
}
