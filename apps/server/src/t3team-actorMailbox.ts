/**
 * Durable inter-agent mailbox (`t3team_thread_mailbox`, migration 92): the
 * messages sent with `t3_thread_send` mode "mailbox", waiting to reach their
 * recipient as ONE coalesced digest run (t3team-actorMailboxDelivery.ts),
 * plus the per-thread user-stop holds that pause delivery.
 *
 * Being a table, it survives restarts without event replay: pending entries
 * stay pending, a digest that was claimed but not marked delivered is
 * re-dispatched with the same id (idempotent), and a hold stays until the
 * user writes again (holds: t3team-actorMailboxHolds.ts). Entries for a
 * deleted recipient are retired as `failed`.
 *
 * @module t3team-actorMailbox
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import {
  type ClaimedDigest,
  groupClaimedDigests,
  MAILBOX_ENTRY_COLUMNS,
  type MailboxEntryRow,
  mailboxEntryFromRow,
  type T3TeamActorMailboxEntry,
} from "./t3team-actorMailboxEntry.ts";

import { makeMailboxHoldOps, type MailboxHoldOps } from "./t3team-actorMailboxHolds.ts";

export type { ClaimedDigest, T3TeamActorMailboxEntry } from "./t3team-actorMailboxEntry.ts";

export class T3TeamActorMailboxError extends Schema.TaggedError<T3TeamActorMailboxError>()(
  "T3TeamActorMailboxError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/** Dispatch attempts after which a claimed batch is given up (state `failed`). */
const MAX_DISPATCH_ATTEMPTS = 3;

type Op<A> = Effect.Effect<A, T3TeamActorMailboxError>;

export class T3TeamActorMailboxStore extends Context.Service<
  T3TeamActorMailboxStore,
  {
    /** Inserts a new entry; false when the message id is already known (idempotent send). */
    readonly enqueue: (
      entry: T3TeamActorMailboxEntry,
      state?: "pending" | "surfaced",
    ) => Op<boolean>;
    /** An entry delivered to `threadId` (any state), for `t3_read_message`. */
    readonly find: (threadId: string, messageId: string) => Op<T3TeamActorMailboxEntry | null>;
    /** Pending entries of a thread, oldest first. */
    readonly pending: (threadId: string) => Op<ReadonlyArray<T3TeamActorMailboxEntry>>;
    /** Threads with pending or claimed entries, except archived ones (they wait for unarchive). */
    readonly threadsWithWork: () => Op<ReadonlyArray<string>>;
    /** Moves exactly these pending entries to `claimed` under `digestMessageId`; false on a race. */
    readonly claim: (input: {
      readonly threadId: string;
      readonly messageIds: ReadonlyArray<string>;
      readonly digestMessageId: string;
    }) => Op<boolean>;
    /** Claimed digests of a thread (dispatch interrupted, e.g. by a restart). */
    readonly claimed: (threadId: string) => Op<ReadonlyArray<ClaimedDigest>>;
    readonly markDelivered: (digestMessageId: string, deliveredAt: string) => Op<void>;
    /** A failed dispatch: back to pending, or `failed` after the attempt cap. */
    readonly release: (digestMessageId: string) => Op<void>;
    /** Dispatch attempts already made for these entries (max), for a fresh digest id. */
    readonly attempts: (messageIds: ReadonlyArray<string>) => Op<number>;
    /** Hop/root of the digest that started a run, for replies sent from that run. */
    readonly replyContext: (
      digestMessageId: string,
    ) => Op<{ readonly hopCount: number; readonly rootThreadId: string } | null>;
    /**
     * A deleted recipient: its pending and claimed entries can never be delivered, so they
     * become `failed` (out of every sweep), and its hold is dropped.
     */
    readonly retireRecipient: (threadId: string) => Op<void>;
  } & MailboxHoldOps
>()("t3/t3team-actorMailbox/T3TeamActorMailboxStore") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = sql.literal(MAILBOX_ENTRY_COLUMNS);
  const op =
    (operation: string) =>
    <A, E>(effect: Effect.Effect<A, E>) =>
      effect.pipe(Effect.mapError((cause) => new T3TeamActorMailboxError({ operation, cause })));

  return T3TeamActorMailboxStore.of({
    enqueue: (entry, state = "pending") =>
      sql<{ readonly message_id: string }>`
        INSERT INTO t3team_thread_mailbox (message_id, to_thread_id, from_thread_id, from_title,
          text, summary, urgency, hop_count, root_thread_id, state, created_at)
        VALUES (${entry.messageId}, ${entry.toThreadId}, ${entry.fromThreadId}, ${entry.fromTitle},
          ${entry.text}, ${entry.summary ?? null}, ${entry.urgency}, ${entry.hopCount},
          ${entry.rootThreadId}, ${state}, ${entry.createdAt})
        ON CONFLICT(message_id) DO NOTHING
        RETURNING message_id`.pipe(
        Effect.map((rows) => rows.length > 0),
        op("enqueue"),
      ),
    find: (threadId, messageId) =>
      sql<MailboxEntryRow>`SELECT ${columns} FROM t3team_thread_mailbox
        WHERE to_thread_id = ${threadId} AND message_id = ${messageId}`.pipe(
        Effect.map(([row]) => (row === undefined ? null : mailboxEntryFromRow(row))),
        op("find"),
      ),
    pending: (threadId) =>
      sql<MailboxEntryRow>`SELECT ${columns} FROM t3team_thread_mailbox
        WHERE to_thread_id = ${threadId} AND state = 'pending'
        ORDER BY created_at ASC, message_id ASC`.pipe(
        Effect.map((rows) => rows.map(mailboxEntryFromRow)),
        op("pending"),
      ),
    // A deleted (or never projected) recipient stays in, so the drain retires it.
    threadsWithWork: () =>
      sql<{ readonly to_thread_id: string }>`SELECT DISTINCT m.to_thread_id
        FROM t3team_thread_mailbox m
        LEFT JOIN orchestration_v2_projection_threads t ON t.thread_id = m.to_thread_id
        WHERE m.state IN ('pending', 'claimed')
          AND (t.archived_at IS NULL OR t.deleted_at IS NOT NULL)`.pipe(
        Effect.map((rows) => rows.map((row) => row.to_thread_id)),
        op("threadsWithWork"),
      ),
    claim: ({ threadId, messageIds, digestMessageId }) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<{ readonly message_id: string }>`UPDATE t3team_thread_mailbox
              SET state = 'claimed', digest_message_id = ${digestMessageId}
              WHERE to_thread_id = ${threadId} AND state = 'pending'
                AND ${sql.in("message_id", messageIds)}
              RETURNING message_id`;
            // A racing claim took some of them: undo ours, report the race.
            if (rows.length !== messageIds.length) {
              yield* sql`UPDATE t3team_thread_mailbox SET state = 'pending', digest_message_id = NULL
                WHERE digest_message_id = ${digestMessageId} AND state = 'claimed'`;
              return false;
            }
            return true;
          }),
        )
        .pipe(op("claim")),
    claimed: (threadId) =>
      sql<MailboxEntryRow>`SELECT ${columns} FROM t3team_thread_mailbox
        WHERE to_thread_id = ${threadId} AND state = 'claimed'
        ORDER BY created_at ASC, message_id ASC`.pipe(
        Effect.map(groupClaimedDigests),
        op("claimed"),
      ),
    markDelivered: (digestMessageId, deliveredAt) =>
      sql`UPDATE t3team_thread_mailbox SET state = 'delivered', delivered_at = ${deliveredAt}
        WHERE digest_message_id = ${digestMessageId} AND state = 'claimed'`.pipe(
        Effect.asVoid,
        op("markDelivered"),
      ),
    release: (digestMessageId) =>
      sql`UPDATE t3team_thread_mailbox SET
          state = CASE WHEN dispatch_attempts + 1 >= ${MAX_DISPATCH_ATTEMPTS}
            THEN 'failed' ELSE 'pending' END,
          digest_message_id = CASE WHEN dispatch_attempts + 1 >= ${MAX_DISPATCH_ATTEMPTS}
            THEN digest_message_id ELSE NULL END,
          dispatch_attempts = dispatch_attempts + 1
        WHERE digest_message_id = ${digestMessageId} AND state = 'claimed'`.pipe(
        Effect.asVoid,
        op("release"),
      ),
    attempts: (messageIds) =>
      sql<{ readonly attempts: number | null }>`SELECT MAX(dispatch_attempts) AS attempts
        FROM t3team_thread_mailbox WHERE ${sql.in("message_id", messageIds)}`.pipe(
        Effect.map((rows) => rows[0]?.attempts ?? 0),
        op("attempts"),
      ),
    replyContext: (digestMessageId) =>
      sql<{ readonly hop_count: number; readonly root_thread_id: string }>`
        SELECT hop_count, root_thread_id FROM t3team_thread_mailbox
        WHERE digest_message_id = ${digestMessageId}
        ORDER BY hop_count DESC LIMIT 1`.pipe(
        Effect.map(([row]) =>
          row === undefined ? null : { hopCount: row.hop_count, rootThreadId: row.root_thread_id },
        ),
        op("replyContext"),
      ),
    retireRecipient: (threadId) =>
      sql`UPDATE t3team_thread_mailbox SET state = 'failed'
        WHERE to_thread_id = ${threadId} AND state IN ('pending', 'claimed')`.pipe(
        Effect.andThen(sql`DELETE FROM t3team_thread_mailbox_holds WHERE thread_id = ${threadId}`),
        sql.withTransaction,
        Effect.asVoid,
        op("retireRecipient"),
      ),
    ...makeMailboxHoldOps(sql, op),
  });
});

export const T3TeamActorMailboxStoreLive = Layer.effect(T3TeamActorMailboxStore, make);
