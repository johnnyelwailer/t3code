import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";

import { ServerConfig } from "./config.ts";
import { OrchestrationEngineLive } from "./orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "./persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "./persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { T3TeamWorkflowEngineReactorLive } from "./t3team-workflowEngineReactor.ts";
import { T3TeamWorkflowEngineRegistryLive } from "./t3team-workflowEngineRegistry.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

/**
 * The engine wiring the recipe harness runs on: the REAL OrchestrationEngine, event store,
 * projection pipeline, workflow run repository + journal and the production resume reactor —
 * the same layers `server.ts` composes — over an in-memory SQLite. Only the model provider is
 * stubbed (see `t3team-recipeWorkflowHarnessStub.ts`).
 */
export function makeT3TeamRecipeHarnessEngineLayer(prefix: string) {
  const nodeLayer = NodeServices.layer;
  const persistence = SqlitePersistenceMemory;
  const config = ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(nodeLayer));
  const engine = OrchestrationEngineLive.pipe(
    Layer.provide(OrchestrationProjectionSnapshotQueryLive),
    Layer.provide(OrchestrationProjectionPipelineLive),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(RepositoryIdentityResolver.layer),
    Layer.provideMerge(persistence),
    Layer.provideMerge(config),
    Layer.provideMerge(nodeLayer),
  );
  return Layer.mergeAll(
    engine,
    T3TeamWorkflowEngineRegistryLive,
    WorkflowRunRepositoryLive.pipe(Layer.provideMerge(persistence)),
    WorkflowJournalStoreLive.pipe(Layer.provideMerge(persistence)),
    WorkspacePaths.layer.pipe(Layer.provide(nodeLayer)),
    persistence,
    config,
    nodeLayer,
  );
}

/** The reactor is a consumer of the engine; it must be layered on top of it. */
export function makeT3TeamRecipeHarnessReactorLayer() {
  return T3TeamWorkflowEngineReactorLive;
}
