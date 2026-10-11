/**
 * `usePackDocument` / `usePackDocuments` for pack views, over a pluggable document source.
 *
 * The pack store (seam S3) is not built yet, so no source is installed and every hook reports
 * `{ status: "unavailable" }` — the state a pack must already handle for a host without a store.
 * The store's client wiring installs its subscription with `setPackDocumentSource`; stories and
 * tests install a fixture source the same way. The calling pack comes from the pack scope, so a
 * view can only ever read its own pack's documents.
 */
import type { PackDoc, PackDocumentState } from "@t3team/pack-ui/contract";
import { useEffect, useMemo, useState } from "react";

import { usePackScope } from "./t3team-packScope";

export interface PackDocumentQuery {
  readonly packId: string;
  readonly collection: string;
  /** One document by key, or every document under `prefix` (all when both are absent). */
  readonly key?: string;
  readonly prefix?: string;
}

export interface PackDocumentSource {
  /** Calls `onDocuments` with the full matching set on every change; returns the unsubscribe. */
  readonly subscribe: (
    query: PackDocumentQuery,
    onDocuments: (documents: ReadonlyArray<PackDoc>) => void,
  ) => () => void;
}

let installedSource: PackDocumentSource | null = null;

/** Install once at boot, before any pack view renders: a mounted view does not re-subscribe. */
export function setPackDocumentSource(source: PackDocumentSource | null): void {
  installedSource = source;
}

function usePackDocumentQuery(
  collection: string,
  filter: { readonly key?: string; readonly prefix?: string },
): PackDocumentState<ReadonlyArray<PackDoc>> {
  const packId = usePackScope();
  const { key, prefix } = filter;
  const query = useMemo(
    (): PackDocumentQuery => ({
      packId,
      collection,
      ...(key === undefined ? {} : { key }),
      ...(prefix === undefined ? {} : { prefix }),
    }),
    [packId, collection, key, prefix],
  );
  const [snapshot, setSnapshot] = useState<{
    readonly query: PackDocumentQuery;
    readonly documents: ReadonlyArray<PackDoc>;
  } | null>(null);
  useEffect(
    () => installedSource?.subscribe(query, (documents) => setSnapshot({ query, documents })),
    [query],
  );
  if (installedSource === null) return { status: "unavailable" };
  // A snapshot of an earlier query is stale, not a smaller answer to this one.
  if (snapshot?.query !== query) return { status: "loading" };
  return { status: "ready", value: snapshot.documents };
}

export function usePackDocument(
  collection: string,
  key: string,
): PackDocumentState<PackDoc | null> {
  const state = usePackDocumentQuery(collection, { key });
  if (state.status !== "ready") return state;
  return { status: "ready", value: state.value.find((document) => document.key === key) ?? null };
}

export function usePackDocuments(
  collection: string,
  options?: { readonly prefix?: string },
): PackDocumentState<ReadonlyArray<PackDoc>> {
  return usePackDocumentQuery(
    collection,
    options?.prefix === undefined ? {} : { prefix: options.prefix },
  );
}
