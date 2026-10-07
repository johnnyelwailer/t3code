import type { PackCollectionDefinition } from "@t3team/pack-api";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import {
  type packDocumentWriter,
  removedChanges,
  upsertChange,
} from "./t3team-packDocumentCommit.ts";
import { incrementPackDocument } from "./t3team-packDocumentCounter.ts";
import type { packDocumentQueries } from "./t3team-packDocumentQueries.ts";
import {
  decodePrefix,
  encodeDocument,
  refuse,
  T3TeamPackDocumentStoreError,
} from "./t3team-packDocumentValidation.ts";

/** Keeps `now + ttlMs` inside the representable date range. */
const MAX_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

interface BoundPack {
  readonly packId: string;
  readonly query: ReturnType<typeof packDocumentQueries>;
  readonly write: ReturnType<typeof packDocumentWriter>;
  readonly validate: (
    collection: string,
    key?: string,
  ) => Effect.Effect<PackCollectionDefinition, T3TeamPackDocumentStoreError>;
}

/** Every write first purges an expired row for its key, publishing that removal. */
export function packDocumentWrites({ packId, query, write, validate }: BoundPack) {
  const prepare = Effect.fnUntraced(function* (collection: string, key: string) {
    const definition = yield* validate(collection, key);
    const time = yield* DateTime.now;
    const now = DateTime.formatIso(time);
    const purged = removedChanges(packId, yield* query.purgeExpired(collection, key, now));
    return { definition, time, now, purged };
  });
  const insertOrGet = (collection: string, key: string, doc: unknown) =>
    write(
      "insertOrGet",
      Effect.gen(function* () {
        const { definition, now, purged } = yield* prepare(collection, key);
        const encoded = yield* encodeDocument(doc, definition.maxDocBytes);
        const inserted = yield* query.insert(collection, key, { ...encoded, now, expiresAt: null });
        const winner = inserted ?? (yield* query.get(collection, key, now));
        if (!winner)
          return yield* new T3TeamPackDocumentStoreError({
            operation: "insertOrGet",
            cause: new Error("Insert winner missing"),
          });
        return {
          value: { doc: winner, inserted: inserted !== null },
          changes: [...purged, ...upsertChange(packId, collection, inserted)],
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
        const { ifVersion, ttlMs } = options;
        if (ifVersion !== undefined && (!Number.isSafeInteger(ifVersion) || ifVersion < 0))
          return yield* refuse("put", "InvalidInput", "Invalid version");
        if (
          ttlMs !== undefined &&
          (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS)
        )
          return yield* refuse("put", "InvalidInput", "Invalid TTL");
        const { definition, time, now, purged } = yield* prepare(collection, key);
        const encoded = yield* encodeDocument(doc, definition.maxDocBytes);
        const expiresAt =
          ttlMs === undefined ? null : DateTime.formatIso(DateTime.addDuration(time, ttlMs));
        const value = { ...encoded, now, expiresAt };
        const result =
          ifVersion === 0
            ? yield* query.insert(collection, key, value)
            : ((yield* query.update(collection, key, value, ifVersion)) ??
              (ifVersion === undefined ? yield* query.insert(collection, key, value) : null));
        return { value: result, changes: [...purged, ...upsertChange(packId, collection, result)] };
      }),
    );
  const increment = (collection: string, key: string, field: string, by: number) =>
    write(
      "increment",
      Effect.gen(function* () {
        const { definition, now, purged } = yield* prepare(collection, key);
        const target = { collection, key, now };
        const result = yield* incrementPackDocument(
          query,
          target,
          field,
          by,
          definition.maxDocBytes,
        );
        return {
          value: result.value,
          changes: [...purged, ...upsertChange(packId, collection, result.doc)],
        };
      }),
    );
  const remove = (collection: string, target: string | { readonly prefix: string }) =>
    write(
      "remove",
      Effect.gen(function* () {
        yield* validate(collection, typeof target === "string" ? target : undefined);
        if (typeof target !== "string") yield* decodePrefix(target.prefix);
        const rows = yield* query.remove(
          collection,
          typeof target === "string" ? { key: target } : { prefix: target.prefix },
        );
        return { value: rows.length, changes: removedChanges(packId, rows) };
      }),
    );
  return { insertOrGet, put, increment, remove };
}
