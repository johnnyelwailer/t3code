import type { T3TeamPackDocument } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type { T3TeamPackDocumentStoreError } from "./t3team-packDocumentValidation.ts";
export type Result<A> = Effect.Effect<A, T3TeamPackDocumentStoreError>;
/** One pack's documents. Expired documents read as missing; reads do not count as `touch`. */
export interface PackDocumentStore {
  readonly get: (collection: string, key: string) => Result<T3TeamPackDocument | null>;
  readonly list: (
    collection: string,
    options?: { prefix?: string; limit?: number; after?: string },
  ) => Result<ReadonlyArray<T3TeamPackDocument>>;
  readonly insertOrGet: (
    collection: string,
    key: string,
    doc: unknown,
  ) => Result<{ doc: T3TeamPackDocument; inserted: boolean }>;
  readonly put: (
    collection: string,
    key: string,
    doc: unknown,
    options?: { ifVersion?: number; ttlMs?: number },
  ) => Result<T3TeamPackDocument | null>;
  readonly increment: (
    collection: string,
    key: string,
    field: string,
    by: number,
  ) => Result<number>;
  /** Removes one key or every key with a prefix; returns how many documents were removed. */
  readonly remove: (
    collection: string,
    target: string | { readonly prefix: string },
  ) => Result<number>;
  /** Records a read for retention (`afterUnreadDays`, quota eviction order). */
  readonly touch: (collection: string, key: string) => Result<void>;
}
