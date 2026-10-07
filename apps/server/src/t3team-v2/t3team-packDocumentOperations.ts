import type { PackCollectionsDefinition } from "@t3team/pack-api";
import type { T3TeamPackDocument } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import type * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";
import type { PackDocumentStore } from "./t3team-packDocumentApi.ts";
import { incrementPackDocument } from "./t3team-packDocumentCounter.ts";
import { packDocumentQueries } from "./t3team-packDocumentQueries.ts";
import type { PackDocumentChange } from "./t3team-packDocumentStream.ts";
import {
  collectionDefinition,
  decodeKey,
  decodePrefix,
  encodeDocument,
  mapPackDocumentError,
} from "./t3team-packDocumentValidation.ts";
export const bindPackDocumentStore = Effect.fnUntraced(
  function* (
    packId: string,
    config: PackCollectionsDefinition,
    changes: PubSub.PubSub<PackDocumentChange>,
    lock: Semaphore.Semaphore,
  ) {
    const sql = yield* SqlClient.SqlClient;
    const query = packDocumentQueries(sql, packId);
    const validate = Effect.fnUntraced(function* (collection: string, key?: string) {
      const definition = yield* Effect.try(() => collectionDefinition(config, collection));
      if (key !== undefined) yield* decodeKey(key);
      return definition;
    });
    const publish = (collection: string, doc: T3TeamPackDocument) =>
      PubSub.publish(changes, { type: "upsert", packId, collection, doc });
    const write = <A>(
      operation: string,
      effect: Effect.Effect<
        { value: A; doc: T3TeamPackDocument | null; collection: string },
        unknown
      >,
    ) =>
      lock
        .withPermits(1)(
          sql.withTransaction(effect).pipe(
            Effect.tap((result) =>
              result.doc ? publish(result.collection, result.doc) : Effect.void,
            ),
            Effect.map((result) => result.value),
            Effect.uninterruptible,
          ),
        )
        .pipe(Effect.mapError(mapPackDocumentError(operation)));
    const get = (collection: string, key: string) =>
      validate(collection, key).pipe(
        Effect.andThen(query.get(collection, key)),
        Effect.mapError(mapPackDocumentError("get")),
      );
    const list = Effect.fnUntraced(
      function* (
        collection: string,
        options: { prefix?: string; limit?: number; after?: string } = {},
      ) {
        yield* validate(collection);
        if (options.prefix !== undefined) yield* decodePrefix(options.prefix);
        if (options.after !== undefined) yield* decodeKey(options.after);
        if (
          options.limit !== undefined &&
          (!Number.isSafeInteger(options.limit) || options.limit < 1)
        )
          return yield* Effect.fail(new Error("Invalid list limit"));
        return yield* query.list(collection, options);
      },
      Effect.mapError(mapPackDocumentError("list")),
    );
    const insertOrGet = (collection: string, key: string, doc: unknown) =>
      write(
        "insertOrGet",
        Effect.gen(function* () {
          const definition = yield* validate(collection, key);
          const encoded = yield* encodeDocument(doc, definition.maxDocBytes);
          const now = DateTime.formatIso(yield* DateTime.now);
          const inserted = yield* query.insert(collection, key, {
            ...encoded,
            now,
            expiresAt: null,
          });
          const winner = inserted ?? (yield* query.get(collection, key));
          if (!winner) return yield* Effect.fail(new Error("Insert winner missing"));
          return {
            collection,
            doc: inserted,
            value: { doc: winner, inserted: inserted !== null },
          };
        }),
      );
    const put = (
      collection: string,
      key: string,
      doc: unknown,
      options: { ifVersion?: number; ttlMs?: number } = {},
    ) =>
      write(
        "put",
        Effect.gen(function* () {
          const definition = yield* validate(collection, key);
          if (
            options.ifVersion !== undefined &&
            (!Number.isSafeInteger(options.ifVersion) || options.ifVersion < 0)
          )
            return yield* Effect.fail(new Error("Invalid version"));
          if (
            options.ttlMs !== undefined &&
            (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1)
          )
            return yield* Effect.fail(new Error("Invalid TTL"));
          const encoded = yield* encodeDocument(doc, definition.maxDocBytes);
          const time = yield* DateTime.now;
          const value = {
            ...encoded,
            now: DateTime.formatIso(time),
            expiresAt:
              options.ttlMs === undefined
                ? null
                : DateTime.formatIso(DateTime.addDuration(time, options.ttlMs)),
          };
          const result =
            options.ifVersion === 0
              ? yield* query.insert(collection, key, value)
              : ((yield* query.update(collection, key, value, options.ifVersion)) ??
                (options.ifVersion === undefined
                  ? yield* query.insert(collection, key, value)
                  : null));
          return { collection, doc: result, value: result };
        }),
      );
    const increment = (collection: string, key: string, field: string, by: number) =>
      write(
        "increment",
        validate(collection, key).pipe(
          Effect.flatMap((definition) =>
            incrementPackDocument(query, collection, key, field, by, definition.maxDocBytes),
          ),
        ),
      );
    return { get, list, insertOrGet, put, increment } satisfies PackDocumentStore;
  },
  Effect.mapError(mapPackDocumentError("forPack")),
);
