/**
 * Dispatch glue for the My Work tools: `t3team.mywork.digest.read` (the digest an agent arranges)
 * and `t3team.mywork.arrange` (store or reset the arrangement). Argument decoding and the answer
 * shape live here; the work is in the handlers bound by `t3team-toolBrokerMyWorkLive.ts`.
 */
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";

const T3TEAM_MY_WORK_DIGEST_READ_TOOL_ID = "t3team.mywork.digest.read";
const T3TEAM_MY_WORK_ARRANGE_TOOL_ID = "t3team.mywork.arrange";

export function isT3TeamMyWorkTool(tool: string): boolean {
  return tool === T3TEAM_MY_WORK_DIGEST_READ_TOOL_ID || tool === T3TEAM_MY_WORK_ARRANGE_TOOL_ID;
}

/** Model-supplied arguments of both tools; `plan` stays untyped until the store validates it. */
const MyWorkToolArgs = Schema.Struct({
  projectId: Schema.optional(Schema.String),
  plan: Schema.optional(Schema.Unknown),
  reset: Schema.optional(Schema.Boolean),
});
type MyWorkToolArgs = typeof MyWorkToolArgs.Type;
const decodeArgs = Schema.decodeUnknownExit(MyWorkToolArgs);

/** Host-side My Work tool handlers; the message of a failure reaches the agent verbatim. */
export type T3TeamMyWorkToolHandlers = {
  readonly readDigest: (args: Pick<MyWorkToolArgs, "projectId">) => Effect.Effect<unknown, string>;
  readonly arrange: (args: MyWorkToolArgs) => Effect.Effect<unknown, string>;
};

export function callT3TeamMyWorkTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly myWorkTools?: T3TeamMyWorkToolHandlers;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { tool, myWorkTools } = input;
  if (!myWorkTools) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }
  const argsExit = decodeArgs(input.toolArgs ?? {});
  if (Exit.isFailure(argsExit)) {
    return Effect.succeed(errorResult(`Invalid arguments for ${tool}: ${String(argsExit.cause)}`));
  }
  const args = argsExit.value;
  if (tool === T3TEAM_MY_WORK_DIGEST_READ_TOOL_ID) {
    return foldResult(myWorkTools.readDigest({ projectId: args.projectId }), okResult, errorResult);
  }
  const wantsReset = args.reset === true;
  if (wantsReset === (args.plan !== undefined)) {
    return Effect.succeed(errorResult(`${tool} takes exactly one of 'plan' or 'reset: true'.`));
  }
  return foldResult(myWorkTools.arrange(args), okResult, errorResult);
}
