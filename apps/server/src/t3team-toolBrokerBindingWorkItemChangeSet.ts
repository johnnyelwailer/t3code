/**
 * Dispatch glue for `t3team.work_item.change_set`: builds every operation with the draft tool's own
 * builder, checks the project scope once per distinct key, and only if ALL pass hands the drafts to
 * the publisher as one batch. Any bad operation or foreign key publishes nothing.
 */
import type { ThreadId } from "@t3tools/contracts";
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { featureDisabledMessage } from "./t3team-featureFlagRoute.ts";
import {
  readT3TeamDraftMutation,
  type T3TeamDraftMutationPublisher,
} from "./t3team-draftMutationPublish.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import type { T3TeamWorkItemReadToolHandlers } from "./t3team-toolBrokerBindingWorkItemRead.ts";
import { callT3TeamDraftMutationTool } from "./t3team-toolBrokerDraftMutations.ts";
import { readRecord, readTrimmedString } from "./t3team-toolBrokerDraftMutationInputs.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { WorkItemChangeSetEnvelope } from "./t3team-workItemChangeSetArgs.ts";
import { toCanonicalDraftCall, WorkItemDraftToolArgs } from "./t3team-workItemDraftArgs.ts";
import { WORK_ITEM_CHANGE_SET_TOOL_ID } from "./t3team-workItemReadAvailability.ts";

const decodeEnvelope = Schema.decodeUnknownExit(WorkItemChangeSetEnvelope);
const decodeOperation = Schema.decodeUnknownExit(WorkItemDraftToolArgs);

type OperationError = { readonly index: number; readonly message: string };

const refused = (errors: ReadonlyArray<OperationError>): T3TeamToolCallResult => {
  const message =
    "Nothing was proposed: fix these operations and send the whole change set again.\n" +
    errors.map(({ index, message }) => `Operation ${index}: ${message}`).join("\n");
  return {
    ...errorResult(message),
    structuredContent: { error: message, operationErrors: errors },
  };
};

/** The built draft of each operation, or the errors of the operations that did not build. */
function buildDrafts(operations: ReadonlyArray<unknown>, view: unknown) {
  const drafts: Array<Record<string, unknown>> = [];
  const errors: OperationError[] = [];
  operations.forEach((operation, index) => {
    const decoded = decodeOperation(operation);
    const call = Exit.isFailure(decoded)
      ? String(decoded.cause)
      : toCanonicalDraftCall(decoded.value);
    const built =
      typeof call === "string"
        ? errorResult(call)
        : callT3TeamDraftMutationTool({ ...call, context: { state: view } });
    const draft = readT3TeamDraftMutation(built);
    if (draft === undefined) {
      errors.push({ index, message: String(readRecord(built.structuredContent)?.error ?? call) });
    } else drafts.push(draft);
  });
  return { drafts, errors };
}

/** The work items a draft is about: its target and, for a link, the other end. */
const keysOf = (draft: Record<string, unknown>) =>
  [
    readTrimmedString(readRecord(draft.target)?.issueIdOrKey),
    readTrimmedString(readRecord(draft.patch)?.otherIssueIdOrKey),
  ].filter((key): key is string => key !== undefined);

export function callT3TeamWorkItemChangeSetTool<E>(input: {
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
      errorResult(`Tool '${WORK_ITEM_CHANGE_SET_TOOL_ID}' is not enabled ${input.scopeLabel}.`),
    );
  }
  // Read per call: an agent holding the tool list from before a change gets a refusal, not drafts.
  if (!readFeatureFlag("WORKITEM_DETAIL_DRAFTS")) {
    return Effect.succeed(errorResult(featureDisabledMessage("WORKITEM_DETAIL_DRAFTS")));
  }
  const envelope = decodeEnvelope(input.toolArgs ?? {});
  if (Exit.isFailure(envelope)) {
    return Effect.succeed(
      errorResult(
        `Invalid arguments for ${WORK_ITEM_CHANGE_SET_TOOL_ID}: ${String(envelope.cause)}`,
      ),
    );
  }
  const { operations } = envelope.value;
  const title = envelope.value.title.trim();
  if (title === "") return Effect.succeed(errorResult("title must not be blank."));
  return Effect.gen(function* () {
    const { drafts, errors } = buildDrafts(operations, yield* input.readView());
    // The tracker is asked once per distinct key across the whole set, not once per operation.
    const foreign = new Set(
      errors.length > 0 ? [] : yield* scope.foreignKeys(drafts.flatMap(keysOf), threadId),
    );
    drafts.forEach((draft, index) => {
      const hit = keysOf(draft).filter((key) => foreign.has(key));
      if (hit.length > 0) {
        errors.push({ index, message: `${hit.join(", ")} is not in this project.` });
      }
    });
    if (errors.length > 0) return refused(errors.toSorted((a, b) => a.index - b.index));
    return yield* publishDraft(okResult({ ok: true, changeSetBatch: { title, drafts } }));
  }).pipe(
    Effect.catch((cause: unknown) =>
      Effect.succeed(
        errorResult(typeof cause === "string" ? cause : "Failed to prepare the change set."),
      ),
    ),
  );
}
