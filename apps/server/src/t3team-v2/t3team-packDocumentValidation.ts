import { T3TeamPackDocumentKey, T3TeamPackDocumentPrefix } from "@t3tools/contracts";
import type { PackCollectionDefinition, PackCollectionsDefinition } from "@t3team/pack-api";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class T3TeamPackDocumentStoreError extends Schema.TaggedError<T3TeamPackDocumentStoreError>()(
  "T3TeamPackDocumentStoreError",
  { operation: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return "Pack document operation failed.";
  }
}

export const decodeKey = Schema.decodeUnknownEffect(T3TeamPackDocumentKey);
export const decodePrefix = Schema.decodeUnknownEffect(T3TeamPackDocumentPrefix);
const isStoreError = Schema.is(T3TeamPackDocumentStoreError);
const decodeJson = Schema.decodeUnknownEffect(Schema.Json);
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Json));
export const mapPackDocumentError = (operation: string) => (cause: unknown) =>
  isStoreError(cause) ? cause : new T3TeamPackDocumentStoreError({ operation, cause });

export function collectionDefinition(
  config: PackCollectionsDefinition,
  collection: string,
): PackCollectionDefinition {
  const value = Object.hasOwn(config, collection) ? config[collection] : undefined;
  if (typeof value !== "object" || value === null) throw new Error("Unknown collection");
  return value;
}

export const encodeDocument = Effect.fnUntraced(function* (doc: unknown, maxBytes: number) {
  const value = yield* decodeJson(doc);
  const json = yield* encodeJson(value);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > maxBytes)
    return yield* new T3TeamPackDocumentStoreError({
      operation: "encodeDocument",
      cause: new Error("Document exceeds collection byte limit"),
    });
  return { json, bytes };
});
