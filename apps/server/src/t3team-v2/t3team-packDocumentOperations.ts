import type { PackCollectionsDefinition } from "@t3team/pack-api";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import type * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";
import type { PackDocumentStore } from "./t3team-packDocumentApi.ts";
import { packDocumentWriter } from "./t3team-packDocumentCommit.ts";
import type { PackDocumentHub } from "./t3team-packDocumentHub.ts";
import { packDocumentQueries } from "./t3team-packDocumentQueries.ts";
import { packDocumentWrites } from "./t3team-packDocumentWrites.ts";
import {
  collectionDefinition,
  decodeKey,
  decodePrefix,
  mapPackDocumentError,
  refuse,
} from "./t3team-packDocumentValidation.ts";

const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

export const bindPackDocumentStore = Effect.fnUntraced(
  function* (
    packId: string,
    config: PackCollectionsDefinition,
    hub: PackDocumentHub,
    lock: Semaphore.Semaphore,
  ) {
    const sql = yield* SqlClient.SqlClient;
    const query = packDocumentQueries(sql, packId);
    const validate = Effect.fnUntraced(
      function* (collection: string, key?: string) {
        const definition = yield* collectionDefinition(config, collection);
        if (key !== undefined) yield* decodeKey(key);
        return definition;
      },
      Effect.mapError(mapPackDocumentError("validate")),
    );
    const write = packDocumentWriter(sql, hub, lock);
    const get = (collection: string, key: string) =>
      validate(collection, key).pipe(
        Effect.andThen(nowIso),
        Effect.flatMap((now) => query.get(collection, key, now)),
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
          return yield* refuse("list", "InvalidInput", "Invalid list limit");
        return yield* query.list(collection, yield* nowIso, options);
      },
      Effect.mapError(mapPackDocumentError("list")),
    );
    /** Marks a live document as read, which is what `afterUnreadDays` and the quota order use. */
    const touch = (collection: string, key: string) =>
      validate(collection, key).pipe(
        Effect.andThen(nowIso),
        Effect.flatMap((now) => query.touch(collection, key, now)),
        Effect.mapError(mapPackDocumentError("touch")),
      );
    const writes = packDocumentWrites({
      packId,
      quotaBytes: config.quotaBytes,
      query,
      write,
      validate,
    });
    return { get, list, touch, ...writes } satisfies PackDocumentStore;
  },
  Effect.mapError(mapPackDocumentError("forPack")),
);
