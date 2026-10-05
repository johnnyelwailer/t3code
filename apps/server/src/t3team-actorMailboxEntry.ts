/**
 * Entry shape of the durable inter-agent mailbox (see t3team-actorMailbox.ts)
 * and its SQL row mapping.
 *
 * @module t3team-actorMailboxEntry
 */
export interface T3TeamActorMailboxEntry {
  readonly messageId: string;
  readonly toThreadId: string;
  readonly fromThreadId: string;
  readonly fromTitle: string;
  readonly text: string;
  /** Short subject; long bodies are delivered as this (or an auto summary) plus a read pointer. */
  readonly summary?: string;
  readonly urgency: "normal" | "urgent";
  readonly hopCount: number;
  readonly rootThreadId: string;
  readonly createdAt: string;
}

export interface ClaimedDigest {
  readonly digestMessageId: string;
  readonly entries: ReadonlyArray<T3TeamActorMailboxEntry>;
}

export interface MailboxEntryRow {
  readonly message_id: string;
  readonly to_thread_id: string;
  readonly from_thread_id: string;
  readonly from_title: string;
  readonly text: string;
  readonly summary: string | null;
  readonly urgency: string;
  readonly hop_count: number;
  readonly root_thread_id: string;
  readonly created_at: string;
  readonly digest_message_id: string | null;
}

export const MAILBOX_ENTRY_COLUMNS = `message_id, to_thread_id, from_thread_id, from_title, text,
  summary, urgency, hop_count, root_thread_id, created_at, digest_message_id`;

export const mailboxEntryFromRow = (row: MailboxEntryRow): T3TeamActorMailboxEntry => ({
  messageId: row.message_id,
  toThreadId: row.to_thread_id,
  fromThreadId: row.from_thread_id,
  fromTitle: row.from_title,
  text: row.text,
  ...(row.summary === null ? {} : { summary: row.summary }),
  urgency: row.urgency === "urgent" ? "urgent" : "normal",
  hopCount: row.hop_count,
  rootThreadId: row.root_thread_id,
  createdAt: row.created_at,
});

/** Groups claimed rows by their digest id, keeping row order. */
export const groupClaimedDigests = (
  rows: ReadonlyArray<MailboxEntryRow>,
): ReadonlyArray<ClaimedDigest> => {
  const byDigest = new Map<string, T3TeamActorMailboxEntry[]>();
  for (const row of rows) {
    if (row.digest_message_id === null) continue;
    byDigest.set(row.digest_message_id, [
      ...(byDigest.get(row.digest_message_id) ?? []),
      mailboxEntryFromRow(row),
    ]);
  }
  return [...byDigest].map(([digestMessageId, entries]) => ({ digestMessageId, entries }));
};
