/**
 * User-stop holds of the inter-agent mailbox (`t3team_thread_mailbox_holds`,
 * migration 92): while a thread is held, no digest starts a run in it. A hold
 * lasts until the user writes in the thread or an ancestor, or the thread is
 * deleted. Part of `T3TeamActorMailboxStore` (t3team-actorMailbox.ts).
 *
 * @module t3team-actorMailboxHolds
 */
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamActorMailboxError } from "./t3team-actorMailbox.ts";

type Op<A> = Effect.Effect<A, T3TeamActorMailboxError>;

export interface MailboxHoldOps {
  readonly hold: (threadId: string, heldAt: string) => Op<void>;
  readonly releaseHolds: (threadIds: ReadonlyArray<string>) => Op<void>;
  readonly isHeld: (threadId: string) => Op<boolean>;
  readonly heldThreads: () => Op<ReadonlyArray<string>>;
  /**
   * Held threads of one lineage tree (V2 `lineage.rootThreadId`): the only holds a user message
   * in that tree can lift, so lifting never walks every hold ever placed.
   */
  readonly heldThreadsInTree: (rootThreadId: string) => Op<ReadonlyArray<string>>;
  /** Drops the holds of threads that no longer exist (deleted, or never projected). */
  readonly pruneHolds: () => Op<void>;
}

type ThreadIdRow = { readonly thread_id: string };

export const makeMailboxHoldOps = (
  sql: SqlClient.SqlClient,
  op: (operation: string) => <A, E>(effect: Effect.Effect<A, E>) => Op<A>,
): MailboxHoldOps => {
  const threadIds = (rows: ReadonlyArray<ThreadIdRow>) => rows.map((row) => row.thread_id);
  return {
    hold: (threadId, heldAt) =>
      sql`INSERT INTO t3team_thread_mailbox_holds (thread_id, held_at)
        VALUES (${threadId}, ${heldAt})
        ON CONFLICT(thread_id) DO UPDATE SET held_at = excluded.held_at`.pipe(
        Effect.asVoid,
        op("hold"),
      ),
    releaseHolds: (ids) =>
      ids.length === 0
        ? Effect.void
        : sql`DELETE FROM t3team_thread_mailbox_holds WHERE ${sql.in("thread_id", ids)}`.pipe(
            Effect.asVoid,
            op("releaseHolds"),
          ),
    isHeld: (threadId) =>
      sql<ThreadIdRow>`SELECT thread_id FROM t3team_thread_mailbox_holds
        WHERE thread_id = ${threadId}`.pipe(
        Effect.map((rows) => rows.length > 0),
        op("isHeld"),
      ),
    heldThreads: () =>
      sql<ThreadIdRow>`SELECT thread_id FROM t3team_thread_mailbox_holds`.pipe(
        Effect.map(threadIds),
        op("heldThreads"),
      ),
    heldThreadsInTree: (rootThreadId) =>
      sql<ThreadIdRow>`SELECT h.thread_id FROM t3team_thread_mailbox_holds h
        JOIN orchestration_v2_projection_threads t ON t.thread_id = h.thread_id
        WHERE json_extract(t.payload_json, '$.lineage.rootThreadId') = ${rootThreadId}`.pipe(
        Effect.map(threadIds),
        op("heldThreadsInTree"),
      ),
    pruneHolds: () =>
      sql`DELETE FROM t3team_thread_mailbox_holds WHERE thread_id NOT IN (
          SELECT thread_id FROM orchestration_v2_projection_threads WHERE deleted_at IS NULL)`.pipe(
        Effect.asVoid,
        op("pruneHolds"),
      ),
  };
};
