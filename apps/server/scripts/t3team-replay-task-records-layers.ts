/**
 * Live layer stack for the task-record replay script
 * (t3team-replay-task-records-to-plans.ts): the REAL OrchestrationEngine,
 * event store, projection pipeline, command receipts and snapshot query —
 * the same composition `server.ts` runs (see
 * `t3team-recipeWorkflowHarnessLayers.ts` for the in-memory variant) — over
 * the LIVE SQLite database instead of an in-memory one.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../src/config.ts";
import { OrchestrationEngineLive } from "../src/orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "../src/orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "../src/orchestration/Layers/ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "../src/orchestration/ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../src/orchestration/ThreadPlanProgress.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../src/persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../src/persistence/Layers/OrchestrationEventStore.ts";
import * as Sqlite from "../src/persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../src/project/RepositoryIdentityResolver.ts";

export const makeTaskReplayLiveLayers = (config: ServerConfig["Service"]) => {
  const nodeLayer = NodeServices.layer;
  const configLayer = ServerConfig.layer(config);
  const persistence = Sqlite.layerConfig.pipe(Layer.provide(configLayer));
  const snapshotQuery = OrchestrationProjectionSnapshotQueryLive.pipe(
    // The shell mapper reads background liveness + plan progress per thread;
    // the engine requires both directly as well, so provide them into both.
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provide(RepositoryIdentityResolver.layer),
  );
  const engine = OrchestrationEngineLive.pipe(
    Layer.provide(snapshotQuery),
    Layer.provide(OrchestrationProjectionPipelineLive),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(RepositoryIdentityResolver.layer),
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provideMerge(persistence),
    Layer.provideMerge(configLayer),
    Layer.provideMerge(nodeLayer),
  );
  return Layer.mergeAll(
    engine,
    OrchestrationProjectionPipelineLive.pipe(
      Layer.provide(OrchestrationEventStoreLive),
      Layer.provideMerge(persistence),
      Layer.provideMerge(configLayer),
      Layer.provideMerge(nodeLayer),
    ),
    persistence,
    configLayer,
    nodeLayer,
  );
};
