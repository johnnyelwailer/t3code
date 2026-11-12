/**
 * Discarding a change set: the verdict is recorded on its artifact (re-upsert, new `status`), and
 * every member draft still awaiting review is dismissed with it, so a re-read resurrects none.
 * Applied members stay applied. Idempotent: repeating it rewrites nothing.
 */
import {
  ThreadId,
  WORK_ITEM_CHANGE_SET_ARTIFACT_KIND,
  WorkItemChangeSet,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import { withDraftMutationStatus } from "./t3team-draftMutationStatus.ts";
import type { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";

const CHANGE_SET_ID_PREFIX = "jira-changeset:";
const decodeChangeSet = Schema.decodeUnknownOption(WorkItemChangeSet);

/** Accepts `jira-changeset:<id>` or the bare id after the prefix. */
function changeSetArtifactIdFromId(value: string): string | undefined {
  const trimmed = value.trim();
  const bare = trimmed.startsWith(CHANGE_SET_ID_PREFIX)
    ? trimmed.slice(CHANGE_SET_ID_PREFIX.length).trim()
    : trimmed;
  return bare.length > 0 ? `${CHANGE_SET_ID_PREFIX}${bare}` : undefined;
}

export const discardWorkItemChangeSet = Effect.fn("t3team.workItemChangeSet.discard")(
  function* (input: {
    readonly artifacts: T3TeamThreadArtifactsStore["Service"];
    readonly threadId: string;
    readonly changeSetId: string;
  }) {
    const id = changeSetArtifactIdFromId(input.changeSetId);
    const artifact = id === undefined ? null : yield* input.artifacts.get(id);
    const decoded = artifact === null ? Option.none() : decodeChangeSet(artifact.payload);
    if (
      artifact === null ||
      artifact.threadId !== input.threadId ||
      artifact.kind !== WORK_ITEM_CHANGE_SET_ARTIFACT_KIND ||
      Option.isNone(decoded)
    ) {
      return yield* new T3TeamAtlassianError({
        message: `No change set '${input.changeSetId}' on thread ${input.threadId}.`,
      });
    }
    const threadId = ThreadId.make(input.threadId);
    // Members first: a failure part-way leaves the set open, and the caller can repeat the discard.
    for (const { draftId } of decoded.value.operations) {
      const member = yield* input.artifacts.get(draftId);
      const payload = member?.threadId === input.threadId ? member.payload : undefined;
      if ((payload as { draft?: { status?: unknown } } | undefined)?.draft?.status !== "draft")
        continue;
      const dismissed = withDraftMutationStatus(payload, "dismissed");
      if (member !== null && dismissed !== undefined) {
        yield* input.artifacts.upsert({ ...member, threadId, payload: dismissed });
      }
    }
    yield* input.artifacts.upsert({
      ...artifact,
      threadId,
      payload: { ...decoded.value, status: "discarded" },
    });
    yield* Effect.logInfo("t3team.workItemChangeSet.verdict", {
      threadId: input.threadId,
      changeSetId: artifact.id,
      status: "discarded",
    });
    return { changeSetId: artifact.id, status: "discarded" } as const;
  },
);
