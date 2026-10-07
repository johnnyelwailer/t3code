/**
 * The fork's shared V2 foundation services, registered once in server.ts
 * (`RuntimeCoreDependenciesBaseLive`) so every fork layer, route and RPC in the
 * server build shares one instance of each: the thread facts and artifacts
 * side stores (their change feeds are in-memory) and the run-less message and
 * lineage writers (which lock and write through the runtime's own
 * `ThreadCommandExecutor`/`EventSinkV2` by reference, see t3team-v2Layers.ts).
 *
 * Fork layers consume these as plain services; they must not build their own.
 */
import * as Layer from "effect/Layer";

import * as PackDocumentStore from "./t3team-packDocumentStore.ts";
import * as ThreadArtifactsStore from "./t3team-threadArtifactsStore.ts";
import * as ThreadFactsStore from "./t3team-threadFactsStore.ts";
import * as ThreadLineage from "./t3team-threadLineage.ts";
import * as ThreadMessageRecorder from "./t3team-threadMessageRecorder.ts";

export const T3TeamV2FoundationLive = Layer.mergeAll(
  ThreadFactsStore.layer,
  PackDocumentStore.layer,
  ThreadArtifactsStore.layer,
  ThreadMessageRecorder.layer,
  ThreadLineage.layer,
);
