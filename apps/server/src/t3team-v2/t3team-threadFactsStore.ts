/**
 * Fork thread facts side store (critic C3): durable per-thread facts in
 * `t3team_thread_facts` plus a live change feed for `t3team.subscribeThreadFacts`.
 *
 * Writers patch only the facts they own (`T3TeamThreadFactsPatch`); reads and
 * the stream return whole records. The change feed is in-memory: a subscriber
 * always starts from a snapshot, so a missed change is repaired by resubscribing.
 * A deleted thread's facts are removed by the thread-deletion reactor
 * (`remove`), and the all-threads snapshot never includes a thread V2 deleted.
 *
 * A stored row this build cannot decode (written by a newer build) is never
 * overwritten: reads skip it, an upsert onto it fails. Keys this build does not
 * know survive an upsert.
 */
import {
  T3TeamThreadFacts,
  type T3TeamThreadFactsStreamEvent,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

import { mergeThreadFacts, type T3TeamThreadFactsPatch } from "./t3team-threadFactsMerge.ts";

export type { T3TeamThreadFactsPatch } from "./t3team-threadFactsMerge.ts";

export class T3TeamThreadFactsStoreError extends Schema.TaggedError<T3TeamThreadFactsStoreError>()(
  "T3TeamThreadFactsStoreError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

type FactsChange = Exclude<T3TeamThreadFactsStreamEvent, { readonly type: "snapshot" }>;

export class T3TeamThreadFactsStore extends Context.Service<
  T3TeamThreadFactsStore,
  {
    /** Applies a partial patch; returns the stored record (unchanged when the patch was a no-op). */
    readonly upsert: (
      threadId: ThreadId,
      patch: T3TeamThreadFactsPatch,
    ) => Effect.Effect<T3TeamThreadFacts, T3TeamThreadFactsStoreError>;
    readonly get: (
      threadId: ThreadId,
    ) => Effect.Effect<T3TeamThreadFacts | null, T3TeamThreadFactsStoreError>;
    readonly list: (
      threadId?: ThreadId,
    ) => Effect.Effect<ReadonlyArray<T3TeamThreadFacts>, T3TeamThreadFactsStoreError>;
    readonly remove: (threadId: ThreadId) => Effect.Effect<void, T3TeamThreadFactsStoreError>;
    /** Snapshot first, then live changes; filtered to one thread when `threadId` is set. */
    readonly subscribe: (input: {
      readonly threadId?: ThreadId;
    }) => Stream.Stream<T3TeamThreadFactsStreamEvent, T3TeamThreadFactsStoreError>;
  }
>()("t3/t3team-v2/t3team-threadFactsStore/T3TeamThreadFactsStore") {}

const FactsJson = Schema.fromJsonString(T3TeamThreadFacts);
const decodeFacts = Schema.decodeUnknownEffect(FactsJson);
const encodeFacts = Schema.encodeEffect(T3TeamThreadFacts);
// The stored object as-is, so keys this build does not know survive a re-write.
const RawFactsJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const decodeRaw = Schema.decodeUnknownOption(RawFactsJson);
const encodeRaw = Schema.encodeEffect(RawFactsJson);

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const changes = yield* PubSub.unbounded<FactsChange>();

  const fail = (operation: string) => (cause: unknown) =>
    new T3TeamThreadFactsStoreError({ operation, cause });

  // An undecodable row (schema drift) is skipped with a warning, never fatal to a list.
  const decodeRows = (rows: ReadonlyArray<{ readonly facts_json: string }>) =>
    Effect.forEach(rows, (row) =>
      decodeFacts(row.facts_json).pipe(
        Effect.map((facts): ReadonlyArray<T3TeamThreadFacts> => [facts]),
        Effect.catchCause((cause) =>
          Effect.logWarning("t3team.threadFacts.decode-failed", { cause }).pipe(Effect.as([])),
        ),
      ),
    ).pipe(Effect.map((chunks) => chunks.flat()));

  const list = (threadId?: ThreadId) =>
    (threadId === undefined
      ? // Rows of threads V2 deleted stay out of the all-threads snapshot every client receives.
        sql<{ readonly facts_json: string }>`
          SELECT facts.facts_json FROM t3team_thread_facts AS facts
          WHERE NOT EXISTS (
            SELECT 1 FROM orchestration_v2_projection_threads AS thread
            WHERE thread.thread_id = facts.thread_id AND thread.deleted_at IS NOT NULL
          )`
      : sql<{ readonly facts_json: string }>`
          SELECT facts_json FROM t3team_thread_facts WHERE thread_id = ${threadId}`
    ).pipe(Effect.flatMap(decodeRows), Effect.mapError(fail("list")));

  const get = (threadId: ThreadId) => list(threadId).pipe(Effect.map((rows) => rows[0] ?? null));

  const upsert = (threadId: ThreadId, patch: T3TeamThreadFactsPatch) =>
    Effect.gen(function* () {
      const nowIso = DateTime.formatIso(yield* DateTime.now);
      const result = yield* sql.withTransaction(
        Effect.gen(function* () {
          const [stored] = yield* sql<{ readonly facts_json: string }>`
            SELECT facts_json FROM t3team_thread_facts WHERE thread_id = ${threadId}`;
          // Never merge onto an undecodable row as if it were absent: that would erase it.
          const current =
            stored === undefined
              ? null
              : yield* decodeFacts(stored.facts_json).pipe(
                  Effect.tapError(() =>
                    Effect.logWarning("t3team.threadFacts.upsert-onto-undecodable-row", {
                      threadId,
                    }),
                  ),
                );
          const next = mergeThreadFacts(threadId, current, patch, nowIso);
          if (next === null && current !== null) return { facts: current, changed: false };
          if (next === null) return yield* Effect.die("empty patch produced no facts record");
          const json = yield* encodeRaw({
            ...(stored === undefined
              ? {}
              : Option.getOrElse(decodeRaw(stored.facts_json), () => ({}))),
            ...(yield* encodeFacts(next)),
          });
          yield* sql`
            INSERT INTO t3team_thread_facts (thread_id, facts_json, updated_at)
            VALUES (${threadId}, ${json}, ${next.updatedAt})
            ON CONFLICT(thread_id) DO UPDATE SET
              facts_json = excluded.facts_json,
              updated_at = excluded.updated_at
          `;
          return { facts: next, changed: true };
        }),
      );
      if (result.changed) yield* PubSub.publish(changes, { type: "upsert", facts: result.facts });
      return result.facts;
    }).pipe(Effect.mapError(fail("upsert")), Effect.withSpan("t3team.threadFacts.upsert"));

  const remove = (threadId: ThreadId) =>
    sql`DELETE FROM t3team_thread_facts WHERE thread_id = ${threadId} RETURNING thread_id`.pipe(
      Effect.flatMap((rows) =>
        rows.length === 0 ? Effect.void : PubSub.publish(changes, { type: "removed", threadId }),
      ),
      Effect.asVoid,
      Effect.mapError(fail("remove")),
    );

  const subscribe = (input: { readonly threadId?: ThreadId }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        // Subscribe before the snapshot so a change between the two is buffered, not lost.
        const subscription = yield* PubSub.subscribe(changes);
        const snapshot = yield* list(input.threadId);
        const live = Stream.fromSubscription(subscription).pipe(
          Stream.filter(
            (change) =>
              input.threadId === undefined ||
              (change.type === "upsert" ? change.facts.threadId : change.threadId) ===
                input.threadId,
          ),
        );
        return Stream.concat(
          Stream.succeed<T3TeamThreadFactsStreamEvent>({ type: "snapshot", facts: snapshot }),
          live,
        );
      }),
    );

  return T3TeamThreadFactsStore.of({ upsert, get, list, remove, subscribe });
});

export const layer = Layer.effect(T3TeamThreadFactsStore, make);
