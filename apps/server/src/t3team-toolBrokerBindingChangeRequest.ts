/**
 * Binding glue for `t3team.change_request.publish`: decodes the call and hands it to the
 * calling thread's publisher (`t3team-toolBrokerChangeRequestLive.ts`), which owns the work.
 *
 * @module t3team-toolBrokerBindingChangeRequest
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { ChangeRequestPublishResult } from "./t3team-changeRequestPublishErrors.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";

export const T3TEAM_CHANGE_REQUEST_PUBLISH_TOOL_ID = "t3team.change_request.publish";

const ChangeRequestPublishArgs = Schema.Struct({
  branch: Schema.String,
  base: Schema.optional(Schema.String),
  paths: Schema.Array(Schema.String),
  commitMessage: Schema.String,
  title: Schema.String,
  body: Schema.String,
  draft: Schema.optional(Schema.Boolean),
});
export type ChangeRequestPublishArgs = typeof ChangeRequestPublishArgs.Type;

const decodeArgs = Schema.decodeUnknownEffect(ChangeRequestPublishArgs);

/** Per-thread handlers; the thread's checkout is already bound, failures are caller sentences. */
export type T3TeamChangeRequestToolHandlers = {
  readonly publish: (
    args: ChangeRequestPublishArgs,
  ) => Effect.Effect<ChangeRequestPublishResult, string>;
};

export function callT3TeamChangeRequestPublishTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly changeRequestTools?: T3TeamChangeRequestToolHandlers | undefined;
}): Effect.Effect<T3TeamToolCallResult> {
  const tool = T3TEAM_CHANGE_REQUEST_PUBLISH_TOOL_ID;
  const handlers = input.changeRequestTools;
  if (handlers === undefined) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}`));
  }
  return decodeArgs(input.toolArgs).pipe(
    Effect.matchEffect({
      onFailure: (issue) =>
        Effect.succeed(
          errorResult(
            `${tool} requires {branch, paths, commitMessage, title, body} (optional base, draft): ${issue.message}`,
          ),
        ),
      onSuccess: (args) => foldResult(handlers.publish(args), okResult, errorResult),
    }),
  );
}
