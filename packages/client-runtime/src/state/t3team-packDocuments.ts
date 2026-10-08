import {
  WS_METHODS,
  type EnvironmentId,
  type T3TeamEnvironmentCapabilities,
  type T3TeamPackDocument,
  type T3TeamPackDocumentsStreamEvent,
  type T3TeamSubscribePackDocumentsInput,
} from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { subscribeWhenSupported } from "../rpc/t3team-capabilityGatedSubscription.ts";
import { createEnvironmentSubscriptionAtomFamily } from "./runtime.ts";
import { THREAD_STATE_IDLE_TTL_MS } from "./threadRetention.ts";

export type T3TeamPackDocuments = ReadonlyArray<T3TeamPackDocument>;
export const EMPTY_T3TEAM_PACK_DOCUMENTS: T3TeamPackDocuments = [];

export const supportsT3TeamPackDocuments = (
  capabilities: T3TeamEnvironmentCapabilities | undefined,
): boolean => capabilities?.packStore === true;

const compareDocuments = (left: T3TeamPackDocument, right: T3TeamPackDocument) =>
  left.key < right.key ? -1 : left.key > right.key ? 1 : 0;

/** Buffered changes can predate the snapshot, so a version never moves backwards. */
export function applyT3TeamPackDocumentsEvent(
  state: T3TeamPackDocuments,
  event: T3TeamPackDocumentsStreamEvent,
): T3TeamPackDocuments {
  switch (event.type) {
    case "snapshot":
      return [...event.documents].sort(compareDocuments);
    case "upsert": {
      const current = state.find((document) => document.key === event.doc.key);
      if (current !== undefined && current.version >= event.doc.version) return state;
      return [...state.filter((document) => document.key !== event.doc.key), event.doc].sort(
        compareDocuments,
      );
    }
    case "removed":
      return state.some((document) => document.key === event.key)
        ? state.filter((document) => document.key !== event.key)
        : state;
  }
}

/** Shared per environment, pack, collection and key/prefix; unsupported servers yield an empty list. */
export function createT3TeamPackDocumentsAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const documents = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "environment-data:t3team:pack-documents",
    idleTtlMs: THREAD_STATE_IDLE_TTL_MS,
    subscribe: (input: T3TeamSubscribePackDocumentsInput) =>
      subscribeWhenSupported(WS_METHODS.t3teamSubscribePackDocuments, input, {
        supported: supportsT3TeamPackDocuments,
        unsupported: {
          type: "snapshot",
          packId: input.packId,
          collection: input.collection,
          documents: [],
        },
      }).pipe(Stream.scan(() => EMPTY_T3TEAM_PACK_DOCUMENTS, applyT3TeamPackDocumentsEvent)),
  });
  return {
    documents: (target: {
      readonly environmentId: EnvironmentId;
      readonly input: T3TeamSubscribePackDocumentsInput;
    }) =>
      documents({
        environmentId: target.environmentId,
        input: {
          packId: target.input.packId,
          collection: target.input.collection,
          ...(target.input.key === undefined ? {} : { key: target.input.key }),
          ...(target.input.prefix === undefined ? {} : { prefix: target.input.prefix }),
        },
      }),
  };
}
