/**
 * Durable open silence watches (`t3team_thread_silence_watches`, migration 98).
 * The table is the watch set's source of truth: the reactor re-reads it on
 * every sweep, so a restart needs no replay. A closed watch is deleted.
 *
 * @module t3team-threadSilenceWatchStore
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type * as Statement from "effect/unstable/sql/Statement";

import type { ThreadSilenceWatchRecord } from "./t3team-threadSilenceWatch.ts";

export class T3TeamThreadSilenceWatchStoreError extends Schema.TaggedError<T3TeamThreadSilenceWatchStoreError>()(
  "T3TeamThreadSilenceWatchStoreError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

type StoreEffect<A> = Effect.Effect<A, T3TeamThreadSilenceWatchStoreError>;

export class T3TeamThreadSilenceWatchStore extends Context.Service<
  T3TeamThreadSilenceWatchStore,
  {
    /**
     * Opens the (watcher, target) watch, or re-arms the open one: a re-arm keeps
     * its watch id and notice counter, takes the new timeout and title, and
     * clears the last notification so a still-silent target is reported again.
     */
    readonly upsert: (input: {
      readonly watchId: string;
      readonly watcherThreadId: string;
      readonly targetThreadId: string;
      readonly targetTitle: string;
      readonly timeoutMs: number;
      readonly createdAt: string;
    }) => StoreEffect<ThreadSilenceWatchRecord>;
    readonly listOpen: StoreEffect<ReadonlyArray<ThreadSilenceWatchRecord>>;
    readonly listForTarget: (
      targetThreadId: string,
    ) => StoreEffect<ReadonlyArray<ThreadSilenceWatchRecord>>;
    readonly markNotified: (input: {
      readonly watchId: string;
      readonly notifyCount: number;
      readonly atMs: number;
    }) => StoreEffect<void>;
    readonly remove: (watchId: string) => StoreEffect<void>;
    /** Closes the watcher's watch on that target; returns how many closed (0 or 1). */
    readonly cancel: (input: {
      readonly watcherThreadId: string;
      readonly targetThreadId: string;
    }) => StoreEffect<number>;
    /** Drops every watch a (gone) watcher holds. */
    readonly removeByWatcher: (watcherThreadId: string) => StoreEffect<void>;
  }
>()("t3/t3team-threadSilenceWatchStore/T3TeamThreadSilenceWatchStore") {}

const fail = (operation: string) => (cause: unknown) =>
  new T3TeamThreadSilenceWatchStoreError({ operation, cause });

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const select = (where: Statement.Fragment) =>
    sql<ThreadSilenceWatchRecord>`
      SELECT watch_id AS "watchId", watcher_thread_id AS "watcherThreadId",
        target_thread_id AS "targetThreadId", target_title AS "targetTitle",
        timeout_ms AS "timeoutMs", notify_count AS "notifyCount",
        last_notified_at AS "lastNotifiedAtMs"
      FROM t3team_thread_silence_watches ${where}
      ORDER BY created_at, watch_id
    `;

  const upsert: T3TeamThreadSilenceWatchStore["Service"]["upsert"] = (input) =>
    Effect.gen(function* () {
      yield* sql`
        INSERT INTO t3team_thread_silence_watches
          (watch_id, watcher_thread_id, target_thread_id, target_title, timeout_ms, created_at)
        VALUES (${input.watchId}, ${input.watcherThreadId}, ${input.targetThreadId},
          ${input.targetTitle}, ${input.timeoutMs}, ${input.createdAt})
        ON CONFLICT (watcher_thread_id, target_thread_id) DO UPDATE SET
          target_title = excluded.target_title,
          timeout_ms = excluded.timeout_ms,
          last_notified_at = NULL
      `;
      const rows = yield* select(
        sql`WHERE watcher_thread_id = ${input.watcherThreadId}
          AND target_thread_id = ${input.targetThreadId}`,
      );
      const record = rows[0];
      if (record === undefined) return yield* Effect.die("silence watch upsert lost its row");
      return record;
    }).pipe(Effect.mapError(fail("upsert")));

  return T3TeamThreadSilenceWatchStore.of({
    upsert,
    listOpen: select(sql.literal("")).pipe(Effect.mapError(fail("listOpen"))),
    listForTarget: (targetThreadId) =>
      select(sql`WHERE target_thread_id = ${targetThreadId}`).pipe(
        Effect.mapError(fail("listForTarget")),
      ),
    markNotified: ({ watchId, notifyCount, atMs }) =>
      sql`
        UPDATE t3team_thread_silence_watches
        SET notify_count = ${notifyCount}, last_notified_at = ${atMs}
        WHERE watch_id = ${watchId}
      `.pipe(Effect.asVoid, Effect.mapError(fail("markNotified"))),
    remove: (watchId) =>
      sql`DELETE FROM t3team_thread_silence_watches WHERE watch_id = ${watchId}`.pipe(
        Effect.asVoid,
        Effect.mapError(fail("remove")),
      ),
    cancel: ({ watcherThreadId, targetThreadId }) =>
      sql<{ readonly watchId: string }>`
        DELETE FROM t3team_thread_silence_watches
        WHERE watcher_thread_id = ${watcherThreadId} AND target_thread_id = ${targetThreadId}
        RETURNING watch_id AS "watchId"
      `.pipe(
        Effect.map((rows) => rows.length),
        Effect.mapError(fail("cancel")),
      ),
    removeByWatcher: (watcherThreadId) =>
      sql`
        DELETE FROM t3team_thread_silence_watches WHERE watcher_thread_id = ${watcherThreadId}
      `.pipe(Effect.asVoid, Effect.mapError(fail("removeByWatcher"))),
  });
});

export const T3TeamThreadSilenceWatchStoreLive = Layer.effect(T3TeamThreadSilenceWatchStore, make);
