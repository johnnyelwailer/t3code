import { T3TeamPackDocumentKey, T3TeamPackDocumentPrefix } from "@t3tools/contracts";
import type { PackCollectionDefinition, PackCollectionsDefinition } from "@t3team/pack-api";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** Refusals the caller can act on; storage failures carry no reason and stay generic. */
const PackDocumentRefusal = Schema.Literals([
  "UnknownPack",
  "UnknownCollection",
  "NotViewWritable",
  "InvalidInput",
  "DocumentTooLarge",
]);
type PackDocumentRefusal = typeof PackDocumentRefusal.Type;
const refusalMessages: Record<PackDocumentRefusal, string> = {
  UnknownPack: "The pack has no registered document store.",
  UnknownCollection: "The pack does not declare this collection.",
  NotViewWritable: "This collection is not writable from views.",
  InvalidInput: "The pack document request is invalid.",
  DocumentTooLarge: "The document exceeds the collection's byte limit.",
};

export class T3TeamPackDocumentStoreError extends Schema.TaggedError<T3TeamPackDocumentStoreError>()(
  "T3TeamPackDocumentStoreError",
  {
    operation: Schema.String,
    reason: Schema.optionalKey(PackDocumentRefusal),
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return this.reason === undefined
      ? "Pack document storage failed."
      : refusalMessages[this.reason];
  }
}

export const refuse = (operation: string, reason: PackDocumentRefusal, detail: string) =>
  new T3TeamPackDocumentStoreError({ operation, reason, cause: new Error(detail) });

export const decodeKey = Schema.decodeUnknownEffect(T3TeamPackDocumentKey);
export const decodePrefix = Schema.decodeUnknownEffect(T3TeamPackDocumentPrefix);
const isStoreError = Schema.is(T3TeamPackDocumentStoreError);
const decodeJson = Schema.decodeUnknownEffect(Schema.Json);
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Json));
export const mapPackDocumentError = (operation: string) => (cause: unknown) =>
  isStoreError(cause)
    ? cause
    : new T3TeamPackDocumentStoreError({
        operation,
        ...(Schema.isSchemaError(cause) ? { reason: "InvalidInput" as const } : {}),
        cause,
      });

export function collectionDefinition(
  config: PackCollectionsDefinition,
  collection: string,
): Effect.Effect<PackCollectionDefinition, T3TeamPackDocumentStoreError> {
  const value = Object.hasOwn(config, collection) ? config[collection] : undefined;
  return typeof value === "object" && value !== null
    ? Effect.succeed(value)
    : Effect.fail(refuse("collection", "UnknownCollection", `Unknown collection ${collection}`));
}

export const encodeDocument = Effect.fnUntraced(function* (doc: unknown, maxBytes: number) {
  const value = yield* decodeJson(doc);
  const json = yield* encodeJson(value);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > maxBytes)
    return yield* refuse("encodeDocument", "DocumentTooLarge", `${bytes} > ${maxBytes} bytes`);
  return { json, bytes };
});
