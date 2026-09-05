/**
 * Feeds agent-proposed drafts from a thread's message stream into the review store.
 *
 * The server publishes each draft as a hidden `draft-mutation` message attachment on the proposing
 * thread (`apps/server/src/t3team-draftMutationPublish.ts`); this is the client side of that pipe —
 * the only production writer of `upsertDrafts`. Reading the thread's own messages means the draft's
 * `sourceThreadId` is authoritative by construction rather than something the payload has to claim.
 *
 * Ingestion is one-way and once-only per draft id: a draft already in the store is skipped, so the
 * reviewer's local decision (accepted / dismissed / returned) is never overwritten by a replay of
 * the same message when the thread is re-opened.
 *
 * Scope limit worth knowing: drafts only reach the store while their thread's detail is loaded. A
 * proposal made by a thread the user has not opened in this session is not visible on the work item
 * until that thread is opened.
 */

import { useEffect } from "react";
import type { EnvironmentId, OrchestrationMessage, ThreadId } from "@t3tools/contracts";

import { useThreadDetail } from "~/state/entities";

const EMPTY_MESSAGES: ReadonlyArray<OrchestrationMessage> = [];
import { normalizeT3TeamDraftMutation } from "~/t3team/t3team-draftMutationModel";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";

/** Pure half: the drafts in `messages` that the store does not already know about. */
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

export function collectT3TeamDraftMutations(input: {
  readonly messages: ReadonlyArray<Pick<OrchestrationMessage, "t3teamExt" | "createdAt">>;
  readonly sourceThreadId: string;
  readonly knownDraftIds: ReadonlySet<string>;
}): ReadonlyArray<T3TeamDraftMutation> {
  const seen = new Set(input.knownDraftIds);
  const collected: T3TeamDraftMutation[] = [];

  for (const message of input.messages) {
    for (const attachment of message.t3teamExt?.attachments ?? []) {
      if (attachment.kind !== "draft-mutation" || seen.has(attachment.draft.id)) continue;
      if (!isPendingT3TeamDraftCarrier((attachment.draft as { status?: unknown }).status)) continue;
      const draft = normalizeT3TeamDraftMutation({
        raw: attachment.draft,
        // `projectId` is deliberately not stamped: the thread's project id and the work item view's
        // project id are not guaranteed to be the same id space, and a mismatch would silently hide
        // every draft. The issue key already scopes the match.
        sourceThreadId: input.sourceThreadId,
        createdAt: message.createdAt,
        ...(attachment.draft.summary ? { summary: attachment.draft.summary } : {}),
      });
      if (!draft) continue;
      seen.add(draft.id);
      collected.push(draft);
    }
  }

  return collected;
}

export function useT3TeamDraftMutationIngest(input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: string;
}): void {
  const { environmentId, threadId } = input;
  const thread = useThreadDetail(
    environmentId === null ? null : { environmentId, threadId: threadId as ThreadId },
  );
  const messages = thread?.messages ?? EMPTY_MESSAGES;

  useEffect(() => {
    const { drafts, upsertDrafts } = useT3TeamDraftMutationStore.getState();
    const collected = collectT3TeamDraftMutations({
      messages,
      sourceThreadId: threadId,
      knownDraftIds: new Set(drafts.map((draft) => draft.id)),
    });
    if (collected.length > 0) upsertDrafts(collected);
  }, [messages, threadId]);
}
