import * as Effect from "effect/Effect";

import {
  callT3TeamDraftMutationTool,
  isT3TeamDraftMutationTool,
} from "./t3team-toolBrokerDraftMutations.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import type { T3TeamDraftMutationPublisher } from "./t3team-draftMutationPublish.ts";

export { isT3TeamDraftMutationTool };

export function callT3TeamDraftMutationToolEffect<E>(input: {
  readonly tool: string;
  readonly toolArgs: unknown;
  readonly readView: () => Effect.Effect<unknown, E>;
  /** Absent on bindings with no thread to publish onto (prelaunch/read-only evaluation). */
  readonly publishDraft?: T3TeamDraftMutationPublisher;
}) {
  const publishDraft = input.publishDraft;
  return input.readView().pipe(
    Effect.map((view) =>
      callT3TeamDraftMutationTool({
        tool: input.tool,
        toolArgs: input.toolArgs,
        context: { state: view },
      }),
    ),
    Effect.flatMap((result) => (publishDraft ? publishDraft(result) : Effect.succeed(result))),
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
