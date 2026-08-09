/**
 * Recording a reviewer's verdict ON the draft carrier — the durable half of accept/dismiss.
 *
 * A draft is published as a hidden carrier message whose id the draft id derives from
 * (`jira-draft:<carrierMessageId>`, see t3team-draftMutationPublish.ts). That makes the carrier
 * addressable, so the verdict is recorded by RE-UPSERTING the same message with the same payload and
 * a new `status` — the same publish path, the same message id, no second channel and no server-owned
 * draft table. A re-read of the thread then returns the verdict, which is what stops an accepted
 * proposal from coming back as pending review.
 *
 * This module is the pure part: given the carrier's `t3teamExt`, produce the updated one. The
 * projector REPLACES `t3teamExt` wholesale on upsert (see ProjectionPipeline's `thread.message-sent`
 * case), so the whole ext is carried through here — `visibleToUser: false`, `visibleToAgent: false`
 * and the author included. Dropping any of them would surface the carrier in the chat as an empty
 * message, which is exactly the bug the hidden carrier exists to avoid.
 */

import type { T3TeamDraftMutationStatus, T3TeamMessageExt } from "@t3tools/contracts";

/** The prefix `buildT3TeamDraftMutationAttachment` puts in front of a Jira work-item draft
 * carrier's message id. */
const DRAFT_ID_PREFIX = "jira-draft:";
/** The prefix `makeT3TeamChangeRequestReviewDraftMethod`
 * (`t3team-workflowChangeRequestReviewDraftTool.ts`) puts in front of a change-request review
 * draft carrier's message id. Listed here, additively, alongside {@link DRAFT_ID_PREFIX} so this
 * ONE status route stays addressable by either draft kind's id scheme without needing to know
 * which kind it is ahead of time. */
const CHANGE_REQUEST_REVIEW_DRAFT_ID_PREFIX = "change-request-review-draft:";
const DRAFT_ID_PREFIXES = [DRAFT_ID_PREFIX, CHANGE_REQUEST_REVIEW_DRAFT_ID_PREFIX];

/**
 * The carrier message id a draft id addresses. Accepts a draft id in any known prefix scheme
 * (`jira-draft:<messageId>`, `change-request-review-draft:<messageId>`) or a bare message id, so a
 * caller holding any of those identifies the same carrier.
 */
export function carrierMessageIdFromDraftId(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const matchedPrefix = DRAFT_ID_PREFIXES.find((prefix) => trimmed.startsWith(prefix));
  const withoutPrefix = matchedPrefix ? trimmed.slice(matchedPrefix.length).trim() : trimmed;
  return withoutPrefix.length > 0 ? withoutPrefix : undefined;
}

/**
 * The carrier's ext with every draft attachment moved to `status`, or `undefined` when the message
 * carries no draft at all (a wrong message id, or a plain message) — the caller reports that rather
 * than silently upserting a message with nothing changed.
 *
 * Everything except `status` is preserved verbatim, including the patch: this records a verdict, it
 * never rewrites the proposal.
 */
export function withDraftMutationStatus(
  ext: T3TeamMessageExt | undefined,
  status: T3TeamDraftMutationStatus,
): T3TeamMessageExt | undefined {
  const attachments = ext?.attachments;
  if (ext === undefined || attachments === undefined) return undefined;
  if (!attachments.some((attachment) => attachment.kind === "draft-mutation")) return undefined;
  return {
    ...ext,
    attachments: attachments.map((attachment) =>
      attachment.kind === "draft-mutation"
        ? { ...attachment, draft: { ...attachment.draft, status } }
        : attachment,
    ),
  };
}
