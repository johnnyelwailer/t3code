/**
 * Publishes a change set: the member `draft-mutation` artifacts plus ONE `work-item-change-set`
 * artifact that groups them. All or nothing: on ANY non-success exit (a failed write, a defect, an
 * interrupt) the artifacts already attempted are removed, and a removal that fails is reported by
 * id. The change-set tool hands the built drafts over as `structuredContent.changeSetBatch`.
 */
import { type WorkItemChangeSet, WORK_ITEM_CHANGE_SET_ARTIFACT_KIND } from "@t3tools/contracts";
import { hashDraftPayload } from "@t3tools/shared/t3team-workItemChangeSetHash";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import { makeDraftArtifactInput } from "./t3team-draftMutationStatus.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { readRecord } from "./t3team-toolBrokerDraftMutationInputs.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";

type RecordArtifact = T3TeamThreadArtifactsStore["Service"]["upsert"];
type RemoveArtifact = T3TeamThreadArtifactsStore["Service"]["remove"];

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

/** The ids whose removal failed; a withdrawal never fails the caller, it reports what is left. */
const withdraw = (removeArtifact: RemoveArtifact, ids: ReadonlyArray<string>) =>
  Effect.forEach(ids, (id) =>
    removeArtifact(id).pipe(
      Effect.as(null),
      Effect.catchCause(() => Effect.succeed(id)),
    ),
  ).pipe(Effect.map((left) => left.filter((id): id is string => id !== null)));

export const publishWorkItemChangeSet = Effect.fn("t3team.workItemChangeSet.publish")(
  function* (input: {
    readonly threadId: string;
    readonly recordArtifact: RecordArtifact;
    readonly removeArtifact: RemoveArtifact;
    readonly batch: WorkItemChangeSetBatch;
  }) {
    const members = input.batch.drafts.map((draft) =>
      makeDraftArtifactInput(input.threadId, draft),
    );
    const operations = members.map((member) => ({
      draftId: member.id,
      issueKey: member.payload.draft.target.issueIdOrKey,
      field: member.payload.draft.field,
      summary: member.payload.draft.summary ?? "",
      payloadHash: hashDraftPayload(member.payload.draft),
    }));
    const changeSet: WorkItemChangeSet = {
      kind: WORK_ITEM_CHANGE_SET_ARTIFACT_KIND,
      id: `jira-changeset:${t3teamRandomUUID()}`,
      title: input.batch.title,
      sourceThreadId: input.threadId,
      createdAt: DateTime.formatIso(yield* DateTime.now),
      status: "draft",
      operations,
    };

    const artifacts = [
      ...members,
      {
        id: changeSet.id,
        threadId: members[0]!.threadId,
        messageId: null,
        kind: WORK_ITEM_CHANGE_SET_ARTIFACT_KIND,
        payload: changeSet,
      },
    ];
    // Recorded before each write: an interrupt mid-write may or may not have stored that row.
    const attempted: string[] = [];
    let stranded: ReadonlyArray<string> = [];
    const outcome = yield* Effect.forEach(
      artifacts,
      (artifact) =>
        Effect.suspend(() => {
          attempted.push(artifact.id);
          return input.recordArtifact(artifact);
        }),
      { discard: true },
    ).pipe(
      Effect.onExit((exit) =>
        Exit.isSuccess(exit)
          ? Effect.void
          : withdraw(input.removeArtifact, attempted).pipe(
              Effect.tap((left) => Effect.sync(() => void (stranded = left))),
            ),
      ),
      Effect.exit,
    );

    if (Exit.isFailure(outcome)) {
      yield* Effect.logWarning("t3team.workItemChangeSet.publishFailed", {
        threadId: input.threadId,
        title: changeSet.title,
        attempted: attempted.length,
        stranded,
      });
      return errorResult(
        stranded.length === 0
          ? "The change set could not be published for review; nothing is pending. Retry, or make the changes directly."
          : `The change set could not be published, and these pending drafts could not be withdrawn: ${stranded.join(", ")}. Ask the user to dismiss them in this thread; do not retry until they are gone.`,
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
