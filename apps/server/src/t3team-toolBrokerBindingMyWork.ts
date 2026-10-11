/**
 * Dispatch glue for the My Work tools: `t3team.mywork.digest.read` (the digest an agent arranges)
 * and `t3team.mywork.arrange` (store or reset the arrangement). Argument decoding and the answer
 * shape live here; the work is in the handlers bound by `t3team-toolBrokerMyWorkLive.ts`.
 */
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { myWorkArrangeMode } from "./t3team-myworkArrangeMode.ts";
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
  scope: Schema.optional(Schema.Literals(["project", "all"])),
  plan: Schema.optional(Schema.Unknown),
  channel: Schema.optional(Schema.String),
  reset: Schema.optional(Schema.Boolean),
  promote: Schema.optional(Schema.Boolean),
  discardDraft: Schema.optional(Schema.Boolean),
  recipe: Schema.optional(Schema.Unknown),
});
type MyWorkToolArgs = typeof MyWorkToolArgs.Type;
const decodeArgs = Schema.decodeUnknownExit(MyWorkToolArgs);

/** Host-side My Work tool handlers; the message of a failure reaches the agent verbatim. */
/** `threadId` is the caller: with no `projectId`, the tools act on that thread's project. */
type CallerArgs = { readonly threadId?: string | undefined };

export type T3TeamMyWorkToolHandlers = {
  readonly readDigest: (
    args: Pick<MyWorkToolArgs, "projectId" | "scope"> & CallerArgs,
  ) => Effect.Effect<unknown, string>;
  readonly arrange: (args: MyWorkToolArgs & CallerArgs) => Effect.Effect<unknown, string>;
};

export function callT3TeamMyWorkTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: string | undefined;
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
  const args = { ...argsExit.value, threadId: input.threadId };
  if (tool === T3TEAM_MY_WORK_DIGEST_READ_TOOL_ID) {
    return foldResult(
      myWorkTools.readDigest({
        projectId: args.projectId,
        scope: args.scope,
        threadId: args.threadId,
      }),
      okResult,
      errorResult,
    );
  }
  const mode = myWorkArrangeMode(args);
  if (!mode.ok) {
    return Effect.succeed(errorResult(`${tool} ${mode.message}`));
  }
  return foldResult(myWorkTools.arrange(args), okResult, errorResult);
}
