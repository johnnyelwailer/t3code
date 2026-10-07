import type { PackCollectionsDefinition } from "@t3team/pack-api";
import {
  type T3TeamPackDocumentsStreamEvent,
  T3TeamSubscribePackDocumentsInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { configuredPackCollections } from "../t3team-packDocumentConfig.ts";
import { bindPackDocumentStore } from "./t3team-packDocumentOperations.ts";
import type { PackDocumentStore, Result } from "./t3team-packDocumentApi.ts";
export type { PackDocumentStore } from "./t3team-packDocumentApi.ts";
import { packDocumentStream, type PackDocumentChange } from "./t3team-packDocumentStream.ts";
import {
  T3TeamPackDocumentStoreError,
  mapPackDocumentError,
} from "./t3team-packDocumentValidation.ts";
export { T3TeamPackDocumentStoreError } from "./t3team-packDocumentValidation.ts";

export class T3TeamPackDocumentStore extends Context.Service<
  T3TeamPackDocumentStore,
  {
    readonly forPack: (packId: string) => Result<PackDocumentStore>;
    readonly subscribe: (
      input: T3TeamSubscribePackDocumentsInput,
    ) => Stream.Stream<T3TeamPackDocumentsStreamEvent, T3TeamPackDocumentStoreError>;
  }
>()("t3/t3team-v2/T3TeamPackDocumentStore") {}

export const PackDocumentCollections = Context.Reference<
  ReadonlyMap<string, PackCollectionsDefinition>
>("t3/PackDocumentCollections", { defaultValue: configuredPackCollections });

const decodeSubscription = Schema.decodeUnknownEffect(T3TeamSubscribePackDocumentsInput);
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const configs = yield* PackDocumentCollections;
  const changes = yield* PubSub.unbounded<PackDocumentChange>();
  const lock = yield* Semaphore.make(1);
  const forPack = Effect.fnUntraced(function* (packId: string) {
    const config = configs.get(packId);
    if (!config)
      return yield* new T3TeamPackDocumentStoreError({
        operation: "forPack",
        cause: new Error("Pack has no registered store"),
      });
    return yield* bindPackDocumentStore(packId, config, changes, lock).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
    );
  });
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
        return packDocumentStream(changes, checked, snapshot);
      }).pipe(Effect.mapError(mapPackDocumentError("subscribe"))),
    );
  return T3TeamPackDocumentStore.of({ forPack, subscribe });
});
export const layer = Layer.effect(T3TeamPackDocumentStore, make);
