/**
 * Record a reviewer's verdict on a proposed draft, durably.
 *
 * A small POST route that re-upserts ONE `draft-mutation` thread artifact (see
 * t3team-draftMutationPublish.ts): the artifact that delivered the proposal is the record that
 * keeps its verdict. No new command type, no second channel.
 *
 * The payload is read from the STORE, not from the request: the caller sends ids and a status, so a
 * client cannot rewrite the patch it is accepting while marking it applied.
 */

import { type T3TeamDraftMutationStatus, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import {
  draftArtifactIdFromDraftId,
  T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND,
  withDraftMutationStatus,
} from "./t3team-draftMutationStatus.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";

const STATUSES: ReadonlySet<string> = new Set(["draft", "applied", "dismissed"]);

export interface T3TeamDraftMutationStatusInput {
  readonly threadId?: string;
  /** The draft id the client keys by (`jira-draft:<id>`), or the bare id after the prefix. */
  readonly draftId?: string;
  /** Older clients name the draft by its carrier id (the bare id); same addressing as `draftId`. */
  readonly carrierMessageId?: string;
  readonly status?: string;
}

/**
 * Set a draft's status. Fails with a sentence naming the cause — a verdict that silently did not
 * persist is the bug this route exists to remove, so nothing here is best-effort.
 */
const setT3TeamDraftMutationStatus = Effect.fn("setT3TeamDraftMutationStatus")(function* (
  input: T3TeamDraftMutationStatusInput,
) {
  const threadId = input.threadId?.trim() ?? "";
  if (threadId.length === 0) {
    return yield* new T3TeamAtlassianError({ message: "threadId is required." });
  }
  const status = input.status?.trim() ?? "";
  if (!STATUSES.has(status)) {
    return yield* new T3TeamAtlassianError({
      message: "status must be one of draft, applied, dismissed.",
    });
  }
  const draftId = draftArtifactIdFromDraftId(input.draftId ?? input.carrierMessageId ?? "");
  if (draftId === undefined) {
    return yield* new T3TeamAtlassianError({ message: "draftId or carrierMessageId is required." });
  }

  const artifacts = yield* T3TeamThreadArtifactsStore;
  const artifact = yield* artifacts.get(draftId);
  if (
    artifact === null ||
    artifact.threadId !== threadId ||
    artifact.kind !== T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND
  ) {
    return yield* new T3TeamAtlassianError({
      message: `No draft '${draftId}' on thread ${threadId}.`,
    });
  }
  const payload = withDraftMutationStatus(artifact.payload, status as T3TeamDraftMutationStatus);
  if (payload === undefined) {
    return yield* new T3TeamAtlassianError({
      message: `Artifact '${draftId}' carries no proposed draft.`,
    });
  }
  yield* artifacts.upsert({
    id: artifact.id,
    threadId: ThreadId.make(threadId),
    messageId: artifact.messageId,
    kind: artifact.kind,
    payload,
  });
  return { draftId, status } as const;
});

export const t3teamThreadDraftMutationStatusRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/draft-mutation/status",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamDraftMutationStatusInput>();
    const result = yield* setT3TeamDraftMutationStatus(input);
    return okJson({ ok: true, ...result });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to record the draft verdict.")),
    Effect.catch(errorResponse),
  ),
);
