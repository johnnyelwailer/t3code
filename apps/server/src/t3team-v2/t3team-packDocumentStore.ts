import type { PackCollectionsDefinition } from "@t3team/pack-api";
import {
  type T3TeamPackDocumentsStreamEvent,
  type T3TeamPackStorePutInput,
  type T3TeamPackStorePutResult,
  T3TeamSubscribePackDocumentsInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { forkParked } from "../serverActivation.ts";
import { configuredPackCollections } from "../t3team-packDocumentConfig.ts";
import type { PackDocumentStore, Result } from "./t3team-packDocumentApi.ts";
import { packDocumentWriter } from "./t3team-packDocumentCommit.ts";
import { makePackDocumentHub } from "./t3team-packDocumentHub.ts";
import { bindPackDocumentStore } from "./t3team-packDocumentOperations.ts";
import { packDocumentRetentionSweep } from "./t3team-packDocumentRetentionSweep.ts";
import { packDocumentStream } from "./t3team-packDocumentStream.ts";
import {
  collectionDefinition,
  refuse,
  T3TeamPackDocumentStoreError,
  mapPackDocumentError,
} from "./t3team-packDocumentValidation.ts";
export type { PackDocumentStore } from "./t3team-packDocumentApi.ts";
export { T3TeamPackDocumentStoreError } from "./t3team-packDocumentValidation.ts";

export class T3TeamPackDocumentStore extends Context.Service<
  T3TeamPackDocumentStore,
  {
    readonly forPack: (packId: string) => Result<PackDocumentStore>;
    readonly subscribe: (
      input: T3TeamSubscribePackDocumentsInput,
    ) => Stream.Stream<T3TeamPackDocumentsStreamEvent, T3TeamPackDocumentStoreError>;
    /** A pack web view's write: only to collections the pack marks `viewWritable`. */
    readonly putFromView: (input: T3TeamPackStorePutInput) => Result<T3TeamPackStorePutResult>;
    /** Runs one retention pass over every registered pack now (the layer also runs it hourly). */
    readonly runRetention: Effect.Effect<void>;
  }
>()("t3/t3team-v2/t3team-packDocumentStore/T3TeamPackDocumentStore") {}

export const PackDocumentCollections = Context.Reference<
  ReadonlyMap<string, PackCollectionsDefinition>
>("t3/PackDocumentCollections", { defaultValue: configuredPackCollections });

const decodeSubscription = Schema.decodeUnknownEffect(T3TeamSubscribePackDocumentsInput);
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const configs = yield* PackDocumentCollections;
  const hub = yield* makePackDocumentHub();
  const lock = yield* Semaphore.make(1);
  const registered = (
    operation: string,
    packId: string,
  ): Effect.Effect<PackCollectionsDefinition, T3TeamPackDocumentStoreError> => {
    const config = configs.get(packId);
    return config === undefined
      ? Effect.fail(refuse(operation, "UnknownPack", `Pack ${packId} has no registered store`))
      : Effect.succeed(config);
  };
  const forPack = (packId: string) =>
    registered("forPack", packId).pipe(
      Effect.flatMap((config) => bindPackDocumentStore(packId, config, hub, lock)),
      Effect.provideService(SqlClient.SqlClient, sql),
    );
  const subscribe = (input: T3TeamSubscribePackDocumentsInput) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const checked = yield* decodeSubscription(input);
        const store = yield* forPack(checked.packId);
        const snapshot =
          checked.key === undefined
            ? store.list(
                checked.collection,
                checked.prefix === undefined ? {} : { prefix: checked.prefix },
              )
            : store
                .get(checked.collection, checked.key)
                .pipe(Effect.map((doc) => (doc === null ? [] : [doc])));
        return packDocumentStream(hub, checked, snapshot);
      }).pipe(Effect.mapError(mapPackDocumentError("subscribe"))),
    ).pipe(
      Stream.tapError((error) =>
        Effect.logWarning("t3team.packDocuments.subscribe-failed", {
          packId: input.packId,
          collection: input.collection,
          operation: error.operation,
          reason: error.reason ?? "storage",
          cause: error.cause,
        }),
      ),
    );
  const putFromView = Effect.fnUntraced(function* (input: T3TeamPackStorePutInput) {
    const config = yield* registered("putFromView", input.packId);
    const definition = yield* collectionDefinition(config, input.collection);
    if (definition.viewWritable !== true)
      return yield* refuse(
        "putFromView",
        "NotViewWritable",
        `${input.collection} is view-readonly`,
      );
    const store = yield* forPack(input.packId);
    return yield* store.put(
      input.collection,
      input.key,
      input.doc,
      input.ifVersion === undefined
        ? { capAtQuota: true }
        : { ifVersion: input.ifVersion, capAtQuota: true },
    );
  });
  const runRetention = packDocumentRetentionSweep(sql, configs, packDocumentWriter(sql, hub, lock));
  yield* forkParked(runRetention.pipe(Effect.repeat(Schedule.spaced("1 hour")), Effect.asVoid));
  return T3TeamPackDocumentStore.of({ forPack, subscribe, putFromView, runRetention });
});
export const layer = Layer.effect(T3TeamPackDocumentStore, make);
