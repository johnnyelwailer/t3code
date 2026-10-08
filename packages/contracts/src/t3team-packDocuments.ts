import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const T3TeamPackDocumentKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9:/@#._-]{1,256}$/),
);
export type T3TeamPackDocumentKey = typeof T3TeamPackDocumentKey.Type;

export const T3TeamPackDocumentPrefix = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9:/@#._-]{0,256}$/),
);
export type T3TeamPackDocumentPrefix = typeof T3TeamPackDocumentPrefix.Type;

export const T3TeamPackDocument = Schema.Struct({
  key: T3TeamPackDocumentKey,
  version: Schema.Int.check(Schema.isGreaterThan(0)),
  doc: Schema.Json,
  updatedAt: IsoDateTime,
  expiresAt: Schema.optionalKey(IsoDateTime),
});
export type T3TeamPackDocument = typeof T3TeamPackDocument.Type;

const scope = { packId: TrimmedNonEmptyString, collection: TrimmedNonEmptyString };

export const T3TeamSubscribePackDocumentsInput = Schema.Struct({
  ...scope,
  key: Schema.optionalKey(T3TeamPackDocumentKey),
  prefix: Schema.optionalKey(T3TeamPackDocumentPrefix),
}).check(
  Schema.makeFilter(
    (input) => input.key === undefined || input.prefix === undefined || "Use either key or prefix.",
  ),
);
export type T3TeamSubscribePackDocumentsInput = typeof T3TeamSubscribePackDocumentsInput.Type;

/** A full snapshot starts each subscription; subsequent events contain one changed document. */
export const T3TeamPackDocumentsStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    ...scope,
    documents: Schema.Array(T3TeamPackDocument),
  }),
  Schema.Struct({ type: Schema.Literal("upsert"), ...scope, doc: T3TeamPackDocument }),
  Schema.Struct({ type: Schema.Literal("removed"), ...scope, key: T3TeamPackDocumentKey }),
]);
export type T3TeamPackDocumentsStreamEvent = typeof T3TeamPackDocumentsStreamEvent.Type;

/** A pack web view writes one document to a `viewWritable` collection, with the store's CAS. */
export const T3TeamPackStorePutInput = Schema.Struct({
  ...scope,
  key: T3TeamPackDocumentKey,
  doc: Schema.Json,
  ifVersion: Schema.optionalKey(NonNegativeInt),
});
export type T3TeamPackStorePutInput = typeof T3TeamPackStorePutInput.Type;

/** `null` means the compare-and-set lost: the document's version was not `ifVersion`. */
export const T3TeamPackStorePutResult = Schema.NullOr(T3TeamPackDocument);
export type T3TeamPackStorePutResult = typeof T3TeamPackStorePutResult.Type;

export class T3TeamPackDocumentsError extends Schema.TaggedError<T3TeamPackDocumentsError>()(
  "T3TeamPackDocumentsError",
  { message: Schema.String },
) {}
