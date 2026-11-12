/**
 * Dispatch glue for `t3team.work_item.draft`. The draft is built and published by the workflow-body
 * broker path, with `publishDraft` bound to the CALLING thread. This adds the project scope: every
 * work item the draft names must be in the bound project (live check) before anything is published.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import {
  readT3TeamDraftMutation,
  type T3TeamDraftMutationPublisher,
} from "./t3team-draftMutationPublish.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import type { T3TeamWorkItemReadToolHandlers } from "./t3team-toolBrokerBindingWorkItemRead.ts";
import { readRecord, readTrimmedString } from "./t3team-toolBrokerDraftMutationInputs.ts";
import { callT3TeamDraftMutationToolEffect } from "./t3team-toolBrokerDraftMutationEffect.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import { WORK_ITEM_DRAFT_TOOL_ID } from "./t3team-workItemReadAvailability.ts";
import { toCanonicalDraftCall, WorkItemDraftToolArgs } from "./t3team-workItemDraftArgs.ts";

const decode = Schema.decodeUnknownExit(WorkItemDraftToolArgs);

/** The work items a built draft is about: its target and, for a link, the other end. */
function keysOfDraft(result: T3TeamToolCallResult): ReadonlyArray<string> | undefined {
  const draft = readT3TeamDraftMutation(result);
  if (draft === undefined) return undefined;
  return [
    readTrimmedString(readRecord(draft.target)?.issueIdOrKey),
    readTrimmedString(readRecord(draft.patch)?.otherIssueIdOrKey),
  ].filter((key): key is string => key !== undefined);
}

/** `publish`, preceded by the project scope check on what the draft names. */
const scopedPublisher =
  (
    publish: T3TeamDraftMutationPublisher,
    scope: T3TeamWorkItemReadToolHandlers,
    threadId: ThreadId,
  ): T3TeamDraftMutationPublisher =>
  (result) => {
    const keys = keysOfDraft(result);
    if (keys === undefined) return Effect.succeed(result);
    return scope.foreignKeys(keys, threadId).pipe(
      Effect.flatMap((foreign) =>
        foreign.length === 0
          ? publish(result)
          : Effect.succeed(
              errorResult(
                `${foreign.join(", ")} ${foreign.length === 1 ? "is" : "are"} not in this project. ` +
                  "Drafts can only target work items of this thread's project.",
              ),
            ),
      ),
      Effect.catch((message: string) => Effect.succeed(errorResult(message))),
    );
  };

export function callT3TeamWorkItemDraftTool<E>(input: {
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId | undefined;
  readonly workItemReadTools?: T3TeamWorkItemReadToolHandlers | undefined;
  readonly readView: () => Effect.Effect<unknown, E>;
  readonly publishDraft?: T3TeamDraftMutationPublisher | undefined;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { threadId, workItemReadTools: scope, publishDraft } = input;
  if (scope === undefined || threadId === undefined || publishDraft === undefined) {
    return Effect.succeed(
      errorResult(`Tool '${WORK_ITEM_DRAFT_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
    );
  }
  const decoded = decode(input.toolArgs ?? {});
  if (Exit.isFailure(decoded)) {
    return Effect.succeed(
      errorResult(`Invalid arguments for ${WORK_ITEM_DRAFT_TOOL_ID}: ${String(decoded.cause)}`),
    );
  }
  const call = toCanonicalDraftCall(decoded.value);
  if (typeof call === "string") return Effect.succeed(errorResult(call));
  return callT3TeamDraftMutationToolEffect({
    tool: call.tool,
    toolArgs: call.toolArgs,
    readView: input.readView,
    publishDraft: scopedPublisher(publishDraft, scope, threadId),
  });
}
