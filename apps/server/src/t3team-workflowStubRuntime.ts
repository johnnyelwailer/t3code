/**
 * The durable workflow engine on a real orchestration V2 runtime with a scripted agent
 * (`t3team-workflowStubAgentTurn.ts`) — the one wiring the workflow integration tests and the
 * recipe E2E harness run on.
 *
 * Everything but the model is production code: the V2 orchestrator, effect worker and event sink
 * (upstream's replay harness), `ThreadManagementService`, the fork foundation writers, the
 * workflow host, run repository, journal store, registry and the resume reactor — all over ONE
 * in-memory SQLite (every layer reference below memoizes to one instance per build).
 */
import type { PackTurnInput } from "@t3team/pack-api";
import { CommandId, EventId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { WorkflowJournalStoreLive } from "./persistence/Layers/SqliteJournalStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import { makeOrchestratorV2ReplayLayerWithRegistry } from "./orchestration-v2/testkit/ProviderReplayHarness.ts";
import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import { T3TeamV2FoundationLive } from "./t3team-v2/t3team-v2FoundationLive.ts";
import { T3TeamWorkflowEngineReactorLayer } from "./t3team-workflowEngineReactor.ts";
import { T3TeamWorkflowEngineRegistryLive } from "./t3team-workflowEngineRegistry.ts";
import * as T3TeamWorkflowHost from "./t3team-workflowHost.ts";
import {
  makeWorkflowStubProvider,
  WORKFLOW_STUB_MODEL_SELECTION,
  type WorkflowStubReply,
} from "./t3team-workflowStubAgentTurn.ts";

export function makeWorkflowStubRuntime(options: {
  readonly name: string;
  readonly respond: (turn: PackTurnInput, index: number) => WorkflowStubReply;
}) {
  const provider = makeWorkflowStubProvider(options.respond);
  const database = SqlitePersistenceMemory;
  const orchestration = makeOrchestratorV2ReplayLayerWithRegistry(
    { name: options.name },
    provider.registryLayer,
    { databaseLayer: database },
  );
  const threads = ThreadManagementService.layer.pipe(Layer.provide(orchestration));
  const foundation = T3TeamV2FoundationLive.pipe(Layer.provide(database));
  const persistence = Layer.mergeAll(
    WorkflowRunRepositoryLive,
    WorkflowJournalStoreLive,
    ProjectStore.layer,
  ).pipe(Layer.provide(database));
  const host = T3TeamWorkflowHost.layer.pipe(
    Layer.provide(Layer.mergeAll(threads, foundation, database)),
  );
  const core = Layer.mergeAll(
    orchestration,
    threads,
    foundation,
    persistence,
    host,
    T3TeamWorkflowEngineRegistryLive,
    database,
  );
  return {
    layer: T3TeamWorkflowEngineReactorLayer.pipe(Layer.provideMerge(core)),
    /** Every turn the scripted agent ran, in order. */
    turns: provider.turns,
    /** End a held turn (see `makeWorkflowStubProvider`). */
    settle: provider.settle,
  };
}

/** Register a project (its workspace root is where the scripted agent's threads run). */
export const seedWorkflowStubProject = (input: {
  readonly projectId: string;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const projects = yield* ProjectStore.ProjectStoreV2;
    const now = DateTime.formatIso(yield* DateTime.now);
    const projectId = ProjectId.make(input.projectId);
    yield* projects.apply({
      sequence: 1,
      eventId: EventId.make(`event:project:${input.projectId}`),
      aggregateKind: "project",
      aggregateId: projectId,
      occurredAt: now,
      commandId: null,
      causationEventId: null,
      correlationId: null,
      metadata: {},
      type: "project.created",
      payload: {
        projectId,
        title: `Project ${input.projectId}`,
        workspaceRoot: input.workspaceRoot,
        defaultModelSelection: WORKFLOW_STUB_MODEL_SELECTION,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  });

/** A user thread on the scripted agent's model (a workflow's launch thread). */
export const createWorkflowStubThread = (input: {
  readonly threadId: string;
  readonly projectId: string;
  readonly title?: string;
}) =>
  Effect.flatMap(ThreadManagementService.ThreadManagementService, (threads) =>
    threads.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${input.threadId}`),
      threadId: ThreadId.make(input.threadId),
      projectId: ProjectId.make(input.projectId),
      title: input.title ?? "Launch thread",
      modelSelection: WORKFLOW_STUB_MODEL_SELECTION,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    }),
  );
