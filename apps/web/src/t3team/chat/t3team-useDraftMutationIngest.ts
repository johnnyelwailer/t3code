/**
 * Feeds agent-proposed drafts from a thread's artifacts into the review store.
 *
 * The server publishes each draft as a `draft-mutation` thread artifact on the proposing thread
 * (`apps/server/src/t3team-draftMutationPublish.ts`, WS `t3team.subscribeThreadArtifacts`); this is
 * the client side of that pipe — the only production writer of `upsertDrafts`. Reading the thread's
 * own artifacts means the draft's `sourceThreadId` is authoritative by construction rather than
 * something the payload has to claim.
 *
 * Ingestion is one-way and once-only per draft id: a draft already in the store is skipped, so the
 * reviewer's local decision (accepted / dismissed / returned) is never overwritten by a replay when
 * the thread is re-opened.
 */

import { useEffect } from "react";
import * as Schema from "effect/Schema";
import {
  T3TeamMessageDraftMutationAttachment,
  type T3TeamThreadArtifact,
} from "@t3tools/contracts";

import { normalizeT3TeamDraftMutation } from "~/t3team/t3team-draftMutationModel";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";

export const T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND = "draft-mutation";

type DraftArtifact = Pick<T3TeamThreadArtifact, "kind" | "payload" | "createdAt">;

const decodeDraftCarrier = Schema.decodeUnknownOption(T3TeamMessageDraftMutationAttachment);

/**
 * Whether a carrier is still awaiting review.
 *
 * The carrier's `status` is the DURABLE record of what happened to a proposal. Once it reads `applied` or
 * `dismissed`, re-ingesting the thread must not resurrect it as pending — otherwise a reload puts an
 * already-accepted rewrite back in the review strip and invites a second write to Jira.
 *
 * Read as a plain string on purpose: the contract currently types `status` as the literal `"draft"` and is
 * being widened to `"draft" | "applied" | "dismissed"`. This is correct before and after that lands, and
 * treats any status it does not recognise as settled rather than pending — the safe direction, since the
 * cost of hiding a draft is a reload and the cost of resurrecting one is a duplicate write.
 */
export function isPendingT3TeamDraftCarrier(status: unknown): boolean {
  return status === "draft" || status === undefined;
}

/** Pure half: the drafts in `artifacts` that the store does not already know about. */
export function collectT3TeamDraftMutations(input: {
  readonly artifacts: ReadonlyArray<DraftArtifact>;
  readonly sourceThreadId: string;
  readonly knownDraftIds: ReadonlySet<string>;
}): ReadonlyArray<T3TeamDraftMutation> {
  const seen = new Set(input.knownDraftIds);
  const collected: T3TeamDraftMutation[] = [];

  for (const artifact of input.artifacts) {
    if (artifact.kind !== T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND) continue;
    const carrier = decodeDraftCarrier(artifact.payload);
    if (carrier._tag === "None" || seen.has(carrier.value.draft.id)) continue;
    const raw = carrier.value.draft;
    if (!isPendingT3TeamDraftCarrier((raw as { status?: unknown }).status)) continue;
    const draft = normalizeT3TeamDraftMutation({
      raw,
      // `projectId` is deliberately not stamped: the thread's project id and the work item view's
      // project id are not guaranteed to be the same id space, and a mismatch would silently hide
      // every draft. The issue key already scopes the match.
      sourceThreadId: input.sourceThreadId,
      createdAt: artifact.createdAt,
      ...(raw.summary ? { summary: raw.summary } : {}),
    });
    if (!draft) continue;
    seen.add(draft.id);
    collected.push(draft);
  }

  return collected;
}

/** Ingests the drafts of one thread, given that thread's live artifacts. */
export function useT3TeamDraftMutationIngest(input: {
  readonly threadId: string;
  readonly artifacts: ReadonlyArray<DraftArtifact>;
}): void {
  const { artifacts, threadId } = input;
  useEffect(() => {
    const { drafts, upsertDrafts } = useT3TeamDraftMutationStore.getState();
    const collected = collectT3TeamDraftMutations({
      artifacts,
      sourceThreadId: threadId,
      knownDraftIds: new Set(drafts.map((draft) => draft.id)),
    });
    if (collected.length > 0) upsertDrafts(collected);
  }, [artifacts, threadId]);
}
