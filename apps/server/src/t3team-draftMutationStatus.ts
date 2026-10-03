/**
 * Recording a reviewer's verdict ON the draft artifact — the durable half of accept/dismiss.
 *
 * A draft is published as a `draft-mutation` thread artifact whose id IS the draft id
 * (`jira-draft:<uuid>`, see t3team-draftMutationPublish.ts). The verdict is recorded by
 * re-upserting the same artifact with the same payload and a new `status` — no second channel. A
 * re-read of the thread's artifacts then returns the verdict, which is what stops an accepted
 * proposal from coming back as pending review.
 *
 * This module is the pure part: id normalisation and the payload update.
 */

import type {
  T3TeamDraftMutationStatus,
  T3TeamMessageDraftMutationAttachment,
} from "@t3tools/contracts";

/** Artifact kind of a draft carrier in the thread artifacts store. */
export const T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND = "draft-mutation";

/** The prefix every draft id (= artifact id) carries. */
const DRAFT_ID_PREFIX = "jira-draft:";

/**
 * The artifact id a client-supplied draft reference addresses. Accepts the draft id
 * (`jira-draft:<id>`) or the bare id after the prefix, so a caller holding either identifies the
 * same artifact.
 */
export function draftArtifactIdFromDraftId(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const withoutPrefix = trimmed.startsWith(DRAFT_ID_PREFIX)
    ? trimmed.slice(DRAFT_ID_PREFIX.length).trim()
    : trimmed;
  return withoutPrefix.length > 0 ? `${DRAFT_ID_PREFIX}${withoutPrefix}` : undefined;
}

const isDraftAttachment = (payload: unknown): payload is T3TeamMessageDraftMutationAttachment => {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as { readonly kind?: unknown; readonly draft?: unknown };
  return record.kind === "draft-mutation" && !!record.draft && typeof record.draft === "object";
};

/**
 * The artifact payload with the draft moved to `status`, or `undefined` when the payload carries
 * no draft — the caller reports that rather than silently writing an unchanged row.
 *
 * Everything except `status` is preserved verbatim, including the patch: this records a verdict,
 * it never rewrites the proposal.
 */
export function withDraftMutationStatus(
  payload: unknown,
  status: T3TeamDraftMutationStatus,
): T3TeamMessageDraftMutationAttachment | undefined {
  if (!isDraftAttachment(payload)) return undefined;
  return { ...payload, draft: { ...payload.draft, status } };
}
