/**
 * Binding glue for `t3team.repository_secret.set`: decode args and call the thread-bound publisher.
 *
 * @module t3team-toolBrokerBindingRepositorySecret
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { RepositorySecretSetResult } from "./t3team-repositorySecretPublisher.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";

export const T3TEAM_REPOSITORY_SECRET_SET_TOOL_ID = "t3team.repository_secret.set";

const RepositorySecretSetArgs = Schema.Struct({
  name: Schema.String,
  label: Schema.String,
  reason: Schema.String,
  placeholder: Schema.optional(Schema.String),
  timeoutMs: Schema.optional(Schema.Number),
  clientRequestId: Schema.optional(Schema.String),
});
export type RepositorySecretSetArgs = typeof RepositorySecretSetArgs.Type;

const decodeArgs = Schema.decodeUnknownEffect(RepositorySecretSetArgs);

export type T3TeamRepositorySecretToolHandlers = {
  readonly set: (args: RepositorySecretSetArgs) => Effect.Effect<RepositorySecretSetResult, string>;
};

export function callT3TeamRepositorySecretSetTool(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly repositorySecretTools?: T3TeamRepositorySecretToolHandlers | undefined;
}): Effect.Effect<T3TeamToolCallResult> {
  const tool = T3TEAM_REPOSITORY_SECRET_SET_TOOL_ID;
  const handlers = input.repositorySecretTools;
  if (handlers === undefined) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}`));
  }
  return decodeArgs(input.toolArgs).pipe(
    Effect.matchEffect({
      onFailure: (issue) =>
        Effect.succeed(
          errorResult(
            `${tool} requires {name, label, reason} (optional placeholder, timeoutMs, clientRequestId): ${issue.message}`,
          ),
        ),
      onSuccess: (args) => foldResult(handlers.set(args), okResult, errorResult),
    }),
  );
}
