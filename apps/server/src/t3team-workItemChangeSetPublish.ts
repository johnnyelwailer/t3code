/**
 * Publishes a change set: the member `draft-mutation` artifacts plus ONE `work-item-change-set`
 * artifact that groups them. All or nothing: if any write fails, the drafts already written are
 * dismissed (the store has no delete on this path) so a re-read shows no half-published set.
 * The change-set tool hands the built drafts over as `structuredContent.changeSetBatch`.
 */
import {
  type WorkItemChangeSet,
  WORK_ITEM_CHANGE_SET_ARTIFACT_KIND,
  hashDraftPayload,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { makeDraftArtifactInput, withDraftMutationStatus } from "./t3team-draftMutationStatus.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { readRecord } from "./t3team-toolBrokerDraftMutationInputs.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";

type RecordArtifact = T3TeamThreadArtifactsStore["Service"]["upsert"];

interface WorkItemChangeSetBatch {
  readonly title: string;
  readonly drafts: ReadonlyArray<Record<string, unknown>>;
}

export function readWorkItemChangeSetBatch(
  result: T3TeamToolCallResult,
): WorkItemChangeSetBatch | undefined {
  if (result.isError) return undefined;
  const batch = readRecord(readRecord(result.structuredContent)?.changeSetBatch);
  const drafts = batch?.drafts;
  if (typeof batch?.title !== "string" || !Array.isArray(drafts)) return undefined;
  return { title: batch.title, drafts: drafts.filter((draft) => readRecord(draft) !== undefined) };
}

export const publishWorkItemChangeSet = Effect.fn("t3team.workItemChangeSet.publish")(
  function* (input: {
    readonly threadId: string;
    readonly recordArtifact: RecordArtifact;
    readonly batch: WorkItemChangeSetBatch;
  }) {
    const members = input.batch.drafts.map((draft) =>
      makeDraftArtifactInput(input.threadId, draft),
    );
    const operations = yield* Effect.forEach(members, (member) =>
      Effect.promise(() => hashDraftPayload(member.payload.draft)).pipe(
        Effect.map((payloadHash) => ({
          draftId: member.id,
          issueKey: member.payload.draft.target.issueIdOrKey,
          field: member.payload.draft.field,
          summary: member.payload.draft.summary ?? "",
          payloadHash,
        })),
      ),
    );
    const changeSet: WorkItemChangeSet = {
      kind: WORK_ITEM_CHANGE_SET_ARTIFACT_KIND,
      id: `jira-changeset:${t3teamRandomUUID()}`,
      title: input.batch.title,
      sourceThreadId: input.threadId,
      createdAt: DateTime.formatIso(yield* DateTime.now),
      status: "draft",
      operations,
    };

    const written: Array<(typeof members)[number]> = [];
    const failure = yield* Effect.gen(function* () {
      for (const member of members) {
        yield* input.recordArtifact(member);
        written.push(member);
      }
      yield* input.recordArtifact({
        id: changeSet.id,
        threadId: members[0]!.threadId,
        messageId: null,
        kind: WORK_ITEM_CHANGE_SET_ARTIFACT_KIND,
        payload: changeSet,
      });
    }).pipe(Effect.flip, Effect.option);

    if (failure._tag === "Some") {
      yield* Effect.forEach(written, (member) =>
        input.recordArtifact({
          ...member,
          payload: withDraftMutationStatus(member.payload, "dismissed") ?? member.payload,
        }),
      ).pipe(Effect.ignore);
      yield* Effect.logWarning("t3team.workItemChangeSet.publishFailed", {
        threadId: input.threadId,
        title: changeSet.title,
        written: written.length,
      });
      return errorResult(
        "The change set could not be published for review; nothing is pending. Retry, or make the changes directly.",
      );
    }
    yield* Effect.logInfo("t3team.workItemChangeSet.published", {
      threadId: input.threadId,
      changeSetId: changeSet.id,
      operations: operations.length,
    });
    return okResult({
      ok: true,
      promptText: `Proposed change set "${changeSet.title}" with ${operations.length} operations. The user reviews it in this thread; nothing is written to Jira until they approve.`,
      changeSet,
    });
  },
);
