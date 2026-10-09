import type { T3TeamPackDocumentsStreamEvent } from "@t3tools/contracts";
import type { PackCollectionsDefinition } from "@t3team/pack-api";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { layerMemory } from "../persistence/Sqlite.ts";
import { ServerActivation } from "../serverActivation.ts";
import * as Store from "./t3team-packDocumentStore.ts";

/**
 * A fresh in-memory store per test. The retention fiber stays parked until `activation`
 * completes, so tests that move the TestClock decide exactly when automatic passes run.
 */
export const packStoreTestLayer = (
  configs: ReadonlyMap<string, PackCollectionsDefinition>,
  activation: Effect.Effect<void> = Effect.never,
) =>
  Store.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Store.PackDocumentCollections, configs),
        Layer.succeed(ServerActivation, activation),
      ),
    ),
    Layer.provideMerge(layerMemory),
  );

export const keysOf = (documents: ReadonlyArray<{ readonly key: string }>) =>
  documents.map((document) => document.key);

/** One readable line per stream event, so tests can assert whole sequences. */
export const eventSummary = (event: T3TeamPackDocumentsStreamEvent) =>
  event.type === "snapshot"
    ? `snapshot:${keysOf(event.documents).join(",")}`
    : event.type === "removed"
      ? `removed:${event.key}`
      : `upsert:${event.doc.key}@${event.doc.version}`;
