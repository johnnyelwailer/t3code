import * as Effect from "effect/Effect";

import {
  callT3workDraftMutationTool,
  isT3workDraftMutationTool,
} from "./t3work-toolBrokerDraftMutations.ts";
import { errorResult } from "./t3work-toolBrokerHelpers.ts";

export { isT3workDraftMutationTool };

export function callT3workDraftMutationToolEffect<E>(input: {
  readonly tool: string;
  readonly toolArgs: unknown;
  readonly readView: () => Effect.Effect<unknown, E>;
}) {
  return input.readView().pipe(
    Effect.map((view) =>
      callT3workDraftMutationTool({
        tool: input.tool,
        toolArgs: input.toolArgs,
        context: { state: view },
      }),
    ),
    Effect.catch((cause) =>
      Effect.succeed(
        errorResult(
          `Failed to prepare Jira draft mutation: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        ),
      ),
    ),
  );
}
