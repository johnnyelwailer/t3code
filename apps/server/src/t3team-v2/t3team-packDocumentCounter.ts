import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { packDocumentQueries } from "./t3team-packDocumentQueries.ts";
import {
  decodeKey,
  encodeDocument,
  refuse,
  T3TeamPackDocumentStoreError,
} from "./t3team-packDocumentValidation.ts";
const decodeObject = Schema.decodeUnknownEffect(Schema.JsonObject);
/** A durable top-level numeric counter; the caller owns the enclosing transaction. */
export const incrementPackDocument = Effect.fnUntraced(function* (
  query: ReturnType<typeof packDocumentQueries>,
  target: { readonly collection: string; readonly key: string; readonly now: string },
  field: string,
  by: number,
  maxDocBytes: number,
) {
  const { collection, key, now } = target;
  yield* decodeKey(field);
  if (!Number.isFinite(by)) return yield* refuse("increment", "InvalidInput", "Invalid increment");
  const existing = yield* query.get(collection, key, now);
  const body = yield* decodeObject(existing === null ? {} : existing.doc);
  const current = Object.hasOwn(body, field) ? body[field] : 0;
  if (typeof current !== "number" || !Number.isFinite(current + by))
    return yield* refuse("increment", "InvalidInput", "Counter must be finite and numeric");
  const value = current + by;
  const encoded = yield* encodeDocument({ ...body, [field]: value }, maxDocBytes);
  const record = { ...encoded, now, expiresAt: existing?.expiresAt ?? null };
  const doc = existing
    ? yield* query.update(collection, key, record, existing.version)
    : yield* query.insert(collection, key, record);
  if (!doc)
    return yield* new T3TeamPackDocumentStoreError({
      operation: "increment",
      cause: new Error("Counter conflict"),
    });
  return { doc, value };
});
