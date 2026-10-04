import {
  CommandId,
  EventId,
  ProjectId,
  type OrchestrationEvent,
  type ProjectMainRepository,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ServerConfig } from "../../config.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { createEmptyReadModel, projectEvent } from "../projector.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";

const layer = it.layer(
  OrchestrationEngineLive.pipe(
    Layer.provideMerge(OrchestrationProjectionSnapshotQueryLive),
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provideMerge(OrchestrationProjectionPipelineLive),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(RepositoryIdentityResolver.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-main-repo-proj-" })),
    Layer.provideMerge(NodeServices.layer),
  ),
);

layer("project main repository projection", (it) => {
  it.effect("persists the main repository with the moved workspace root, and clears it", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      const query = yield* ProjectionSnapshotQuery;
      const projectId = ProjectId.make("project-main-repo");
      const mainRepository: ProjectMainRepository = {
        url: "https://github.com/acme/alpha",
        checkoutPath: "/tmp/main-repo-home/.t3team/references/01-alpha",
        projectRoot: "/tmp/main-repo-home",
        selection: "user",
      };
      yield* engine.dispatch({
        type: "project.create",
        commandId: CommandId.make("cmd-main-repo-create"),
        projectId,
        title: "Main repo",
        workspaceRoot: "/tmp/main-repo-home",
        defaultModelSelection: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      yield* engine.dispatch({
        type: "project.meta.update",
        commandId: CommandId.make("cmd-main-repo-set"),
        projectId,
        workspaceRoot: mainRepository.checkoutPath,
        mainRepository,
      });

      const shell = Option.getOrThrow(yield* query.getProjectShellById(projectId));
      assert.strictEqual(shell.workspaceRoot, mainRepository.checkoutPath);
      assert.deepEqual(shell.mainRepository, mainRepository);
      const snapshot = yield* query.getSnapshot();
      assert.deepEqual(
        snapshot.projects.find((project) => project.id === projectId)?.mainRepository,
        mainRepository,
      );
      const commandModel = yield* query.getCommandReadModel();
      assert.deepEqual(
        commandModel.projects.find((project) => project.id === projectId)?.mainRepository,
        mainRepository,
      );

      // An update that does not mention it leaves it alone; null clears it.
      yield* engine.dispatch({
        type: "project.meta.update",
        commandId: CommandId.make("cmd-main-repo-rename"),
        projectId,
        title: "Renamed",
      });
      const renamed = Option.getOrThrow(yield* query.getProjectShellById(projectId));
      assert.deepEqual(renamed.mainRepository, mainRepository);
      yield* engine.dispatch({
        type: "project.meta.update",
        commandId: CommandId.make("cmd-main-repo-clear"),
        projectId,
        mainRepository: null,
      });
      const cleared = Option.getOrThrow(yield* query.getProjectShellById(projectId));
      assert.isUndefined(cleared.mainRepository);
    }),
  );
});

it.effect("the in-memory projector sets and clears the main repository", () =>
  Effect.gen(function* () {
    const now = "2026-01-01T00:00:00.000Z";
    const projectId = ProjectId.make("project-main-repo-memory");
    const event = (sequence: number, type: string, payload: object): OrchestrationEvent =>
      ({
        sequence,
        eventId: EventId.make(`evt-main-repo-${sequence}`),
        aggregateKind: "project",
        aggregateId: projectId,
        type,
        occurredAt: now,
        commandId: CommandId.make(`cmd-main-repo-${sequence}`),
        causationEventId: null,
        correlationId: CommandId.make(`cmd-main-repo-${sequence}`),
        metadata: {},
        payload,
      }) as OrchestrationEvent;
    const mainRepository: ProjectMainRepository = { checkoutPath: "/tmp/alpha", selection: "user" };
    const created = yield* projectEvent(
      createEmptyReadModel(now),
      event(1, "project.created", {
        projectId,
        title: "Memory",
        workspaceRoot: "/tmp/home",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      }),
    );
    const set = yield* projectEvent(
      created,
      event(2, "project.meta-updated", { projectId, mainRepository, updatedAt: now }),
    );
    assert.deepEqual(set.projects[0]?.mainRepository, mainRepository);
    const cleared = yield* projectEvent(
      set,
      event(3, "project.meta-updated", { projectId, mainRepository: null, updatedAt: now }),
    );
    assert.isFalse(cleared.projects[0] !== undefined && "mainRepository" in cleared.projects[0]);
  }).pipe(Effect.provide(NodeServices.layer)),
);
