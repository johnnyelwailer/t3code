/**
 * Pure half of the V1 rich-message cutover (`t3team-legacyRichMessageCutover.ts`):
 * what a V1 fork row becomes on V2 beyond the imported message itself.
 *
 * - A V1 `system` row's attachments become thread artifacts, split exactly as a
 *   live workflow message is (`splitWorkflowMessage`): widgets → `widget`
 *   artifacts, other rich attachments → one `message-ext` artifact, anchored to
 *   the imported note when it has text. A draft proposal (V1 kept it on a hidden
 *   carrier row) becomes the `draft-mutation` artifact whose id is the draft id,
 *   so the reviewer's verdict route and the client's draft ingest find it.
 * - V1 inter-agent deliveries still pending at shutdown: every `actor` row of a
 *   recipient whose reaction turn never ran. A reaction turn is a hidden user
 *   row whose ext `actor.messageIds` names its batch; older single-delivery
 *   reaction rows carry no ids and consume the oldest matching delivery (same
 *   sender, hop and root), as V1's own restart rehydrate did.
 */
import { type T3TeamMessageAttachment, ThreadId } from "@t3tools/contracts";

import {
  draftArtifactIdFromDraftId,
  T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND,
} from "../../t3team-draftMutationStatus.ts";
import type { T3TeamThreadArtifactInput } from "../../t3team-v2/t3team-threadArtifactsStore.ts";
import { splitWorkflowMessage } from "../../t3team-workflowHostMessages.ts";
import { legacyMessageExt } from "./t3team-legacyMessageMapping.ts";

export interface LegacySystemRow {
  readonly messageId: string;
  readonly threadId: string;
  readonly text: string;
  readonly extJson: string;
  readonly visible: boolean;
  readonly createdAt: string;
}

type DraftAttachment = Extract<T3TeamMessageAttachment, { readonly kind: "draft-mutation" }>;
const isDraft = (attachment: T3TeamMessageAttachment): attachment is DraftAttachment =>
  attachment.kind === "draft-mutation";

/** The artifacts a V1 system row's attachments become (each created at the row's time). */
export function legacySystemRowArtifacts(
  row: LegacySystemRow,
): ReadonlyArray<T3TeamThreadArtifactInput> {
  const ext = legacyMessageExt(row.extJson);
  const attachments = ext?.attachments ?? [];
  const threadId = ThreadId.make(row.threadId);
  const drafts = attachments.filter(isDraft).flatMap((attachment) => {
    const id = draftArtifactIdFromDraftId(attachment.draft.id);
    return id === undefined
      ? []
      : [
          {
            id,
            threadId,
            messageId: null,
            kind: T3TEAM_DRAFT_MUTATION_ARTIFACT_KIND,
            payload: { ...attachment, draft: { ...attachment.draft, id } },
            createdAt: row.createdAt,
          },
        ];
  });
  const shown = attachments.filter((attachment) => !isDraft(attachment));
  // A hidden row's other attachments were never shown; only its draft proposals carry over.
  if (!row.visible || shown.length === 0) return drafts;
  const { artifacts } = splitWorkflowMessage({
    threadId: row.threadId,
    messageId: row.messageId,
    role: "system",
    text: row.text,
    ext: { ...ext, attachments: shown },
  });
  return [...drafts, ...artifacts.map((artifact) => ({ ...artifact, createdAt: row.createdAt }))];
}

export interface LegacyActorRow {
  readonly messageId: string;
  readonly threadId: string;
  readonly role: string;
  readonly text: string;
  readonly extJson: string;
  readonly createdAt: string;
}

/** Shaped as a `t3team_thread_mailbox` entry (`T3TeamActorMailboxEntry`). */
export interface LegacyPendingDelivery {
  readonly messageId: string;
  readonly toThreadId: string;
  readonly fromThreadId: string;
  readonly fromTitle: string;
  readonly text: string;
  readonly summary?: string;
  readonly urgency: "normal" | "urgent";
  readonly hopCount: number;
  readonly rootThreadId: string;
  readonly createdAt: string;
}

/** Deliveries no reaction turn consumed; `rows` in V1 order (created_at, message_id). */
export function collectPendingV1Deliveries(
  rows: ReadonlyArray<LegacyActorRow>,
  hopCap: number,
): ReadonlyArray<LegacyPendingDelivery> {
  let pending: LegacyPendingDelivery[] = [];
  for (const row of rows) {
    const ext = legacyMessageExt(row.extJson);
    const actor = ext?.actor;
    if (actor === undefined) continue;
    if (row.role === "actor") {
      // Past the hop cap V1 only surfaced the message; it was never delivered.
      if (actor.hopCount > hopCap) continue;
      const fromTitle = ext?.author?.kind === "actor" ? ext.author.title.trim() : "";
      pending.push({
        messageId: row.messageId,
        toThreadId: row.threadId,
        fromThreadId: actor.senderThreadId,
        fromTitle: fromTitle.length > 0 ? fromTitle : actor.senderThreadId,
        text: row.text,
        ...(actor.summary === undefined ? {} : { summary: actor.summary }),
        urgency: actor.urgency,
        hopCount: actor.hopCount,
        rootThreadId: actor.rootThreadId,
        createdAt: row.createdAt,
      });
      continue;
    }
    if (row.role !== "user" || ext?.visibleToUser !== false) continue;
    if (actor.messageIds !== undefined) {
      const reacted = new Set(actor.messageIds);
      pending = pending.filter(
        (entry) => entry.toThreadId !== row.threadId || !reacted.has(entry.messageId),
      );
      continue;
    }
    const index = pending.findIndex(
      (entry) =>
        entry.toThreadId === row.threadId &&
        entry.fromThreadId === actor.senderThreadId &&
        entry.hopCount === actor.hopCount &&
        entry.rootThreadId === actor.rootThreadId,
    );
    if (index >= 0) pending.splice(index, 1);
  }
  return pending;
}
