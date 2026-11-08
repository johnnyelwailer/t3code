import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";

import {
  callT3TeamDraftMutationTool,
  isT3TeamDraftMutationTool,
} from "./t3team-toolBrokerDraftMutations.ts";
import { featureDisabledMessage } from "./t3team-featureFlagRoute.ts";
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
  // Read per call: an agent holding the tool list from before a change gets a refusal, not a draft.
  if (!readFeatureFlag("WORKITEM_DETAIL_DRAFTS")) {
    return Effect.succeed(errorResult(featureDisabledMessage("WORKITEM_DETAIL_DRAFTS")));
  }
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
