import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { layerMemory as SqlitePersistenceMemory } from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import type { ProviderAdapterV2Shape } from "../orchestration-v2/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import { layerWithRegistry } from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import * as ThreadLineage from "./t3team-threadLineage.ts";
import * as ThreadMessageRecorder from "./t3team-threadMessageRecorder.ts";

const instanceId = ProviderInstanceId.make("codex");
export const testModelSelection = { instanceId, model: "gpt-5.1-codex" };

// No provider process: these tests never run the effect worker.
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process in t3team-v2 tests"),
} as ProviderAdapterV2Shape;

/**
 * An orchestrator over an in-memory database plus the fork writers, all in one
 * build so the writers share the orchestrator's thread lock. `overrides`
 * provides Context.Reference hooks (e.g. the settle guard) to the orchestrator.
 */
export const makeT3TeamV2TestLayer = (
  name: string,
  overrides: Layer.Layer<never> = Layer.empty,
) => {
  const database = SqlitePersistenceMemory;
  return Layer.mergeAll(
    database,
    ProjectionStore.layer.pipe(Layer.provide(database)),
    layerWithRegistry(
      { name },
      ProviderAdapterRegistry.layerFromAdapters([adapter]),
      { databaseLayer: database, runEffectWorker: false },
    ).pipe(Layer.provide(overrides)),
    ThreadMessageRecorder.layer.pipe(Layer.provide(database)),
    ThreadLineage.layer.pipe(Layer.provide(database)),
  );
};

export const createTestThread = (threadId: ThreadId, title = "Thread") =>
  Effect.flatMap(Orchestrator.OrchestratorV2, (orchestrator) =>
    orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:t3team-v2"),
      title,
      modelSelection: testModelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    }),
  );
