/**
 * Publishes an agent-proposed draft mutation to the client's review surface.
 *
 * The `*.draft_*` broker tools only build a `draftMutation` payload; the tool result itself is not
 * a reliable transport to the client (each provider adapter reshapes tool results for display, and
 * the Claude adapter does not even classify every draft tool as an MCP call). So the draft rides
 * the fork's typed, durable, replayable channel: a `draft-mutation` thread artifact on the
 * proposing thread (U0 artifacts side store, `t3team.subscribeThreadArtifacts`). It is transport,
 * not conversation: no V2 message is written, so the agent's prompt never sees it. Mirrors
 * `t3team-widgetShowTool.ts`.
 */

import {
  ThreadId,
  type T3TeamDraftMutationPayload,
  type T3TeamMessageDraftMutationAttachment,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND } from "./t3team-draftMutationStatus.ts";
import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import {
  T3TeamThreadArtifactsStore,
  T3TeamThreadArtifactsStoreError,
} from "./t3team-v2/t3team-threadArtifactsStore.ts";

/** Takes a draft tool's result and returns it once the draft has reached the review surface. */
export type T3TeamDraftMutationPublisher = (
  result: T3TeamToolCallResult,
) => Effect.Effect<T3TeamToolCallResult>;

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** `undefined` when the result carries no draft (an error result, or a non-draft tool). */
function readT3TeamDraftMutation(
  result: T3TeamToolCallResult,
): Record<string, unknown> | undefined {
  if (result.isError) return undefined;
  const draft = readRecord(readRecord(result.structuredContent)?.draftMutation);
  return draft?.kind === "jira-work-item-draft" ? draft : undefined;
}

export function makeT3TeamDraftMutationPublisher(input: {
  readonly threadId: string;
  /** Durable artifact write (`T3TeamThreadArtifactsStore.upsert`). */
  readonly recordArtifact: T3TeamThreadArtifactsStore["Service"]["upsert"];
}): T3TeamDraftMutationPublisher {
  return (result) =>
    Effect.gen(function* () {
      const draftMutation = readT3TeamDraftMutation(result);
      if (!draftMutation) return result;

      // The draft id IS the artifact id, so the reviewer's verdict addresses the same row and a
      // re-read never resurrects an accepted or dismissed draft as a fresh proposal.
      const draftId = `jira-draft:${t3teamRandomUUID()}`;
      const attachment: T3TeamMessageDraftMutationAttachment = {
        kind: "draft-mutation",
        draft: { ...draftMutation, id: draftId } as unknown as T3TeamDraftMutationPayload,
      };
      const recorded = yield* input
        .recordArtifact({
          id: draftId,
          threadId: ThreadId.make(input.threadId),
          messageId: null,
          kind: T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND,
          payload: attachment,
        })
        .pipe(Effect.result);

      // A draft the reviewer will never see is not a proposal. Fail loudly rather than telling the
      // agent its change is waiting for approval somewhere nobody is looking.
      if (recorded._tag === "Failure") {
        return errorResult(
          "The draft was built but could not be published for review; nothing is pending. Retry, or make the change directly.",
        );
      }
      return result;
    });
}

/**
 * Broker binder: captures the artifacts store once at layer build and mints per-thread
 * publishers. Without the store in this runtime, publishing reports that nothing is pending.
 */
export const makeT3TeamDraftMutationPublisherBinder = Effect.fnUntraced(function* () {
  const artifacts = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamThreadArtifactsStore));
  return (threadId: string): T3TeamDraftMutationPublisher =>
    makeT3TeamDraftMutationPublisher({
      threadId,
      recordArtifact:
        artifacts?.upsert ??
        (() =>
          Effect.fail(
            new T3TeamThreadArtifactsStoreError({ operation: "upsert", cause: "unavailable" }),
          )),
    });
});
