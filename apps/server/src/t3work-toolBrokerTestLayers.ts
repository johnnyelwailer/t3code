import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { GitWorkflowService } from "./git/GitWorkflowService.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionSnapshotQueryShape,
} from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProjectSetupScriptRunner } from "./project/ProjectSetupScriptRunner.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3workThreadToolContextStoreLive } from "./t3work-threadToolContextStore.ts";
import {
  NoopT3workContextRefreshService,
  T3workContextRefreshService,
} from "./t3work-contextRefreshService.ts";
import { makeContextRefreshLiveLayer } from "./t3work-contextRefreshTestFixtures.ts";
import { T3workToolBrokerLive } from "./t3work-toolBrokerLive.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

const threadId = ThreadId.make("thread-1");

function joinPosix(...segments: ReadonlyArray<string>): string {
  const normalized = segments
    .filter((segment) => segment.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function dirnamePosix(value: string): string {
  const normalized = value.replace(/\/+/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  return lastSlashIndex <= 0 ? "/" : normalized.slice(0, lastSlashIndex);
}

const projectId = ProjectId.make("project-1");
const stubFileSystemLayer = Layer.succeed(FileSystem.FileSystem, {} as FileSystem.FileSystem);
const stubPathLayer = Layer.succeed(Path.Path, {
  join: joinPosix,
  dirname: dirnamePosix,
  resolve: (...segments: ReadonlyArray<string>) => joinPosix(...segments),
  isAbsolute: (value: string) => value.startsWith("/"),
  relative: (from: string, to: string) => {
    const fromParts = from.split("/").filter(Boolean);
    const toParts = to.split("/").filter(Boolean);
    let index = 0;
    while (
      index < fromParts.length &&
      index < toParts.length &&
      fromParts[index] === toParts[index]
    ) {
      index += 1;
    }
    const up = Array.from({ length: fromParts.length - index }, () => "..");
    return [...up, ...toParts.slice(index)].join("/") || ".";
  },
} as unknown as Path.Path);
const stubFileSystemPathLayer = Layer.mergeAll(stubFileSystemLayer, stubPathLayer);
const stubWorkspacePathsLayer = WorkspacePaths.layer.pipe(Layer.provide(stubFileSystemPathLayer));
const stubStartChildServices = Layer.mergeAll(
  stubFileSystemPathLayer,
  Layer.succeed(GitWorkflowService, {} as GitWorkflowService["Service"]),
  Layer.succeed(SourceControlProviderRegistry, {} as SourceControlProviderRegistry["Service"]),
  Layer.succeed(ProjectSetupScriptRunner, {} as ProjectSetupScriptRunner["Service"]),
);

const projectionQueryMock: ProjectionSnapshotQueryShape = {
  getCommandReadModel: () => Effect.die("unused"),
  getSnapshot: () => Effect.die("unused"),
  getShellSnapshot: () => Effect.die("unused"),
  getArchivedShellSnapshot: () => Effect.die("unused"),
  getSnapshotSequence: () => Effect.die("unused"),
  getCounts: () => Effect.die("unused"),
  getActiveProjectByWorkspaceRoot: () => Effect.die("unused"),
  getProjectShellById: () =>
    Effect.succeed(
      Option.some({
        id: projectId,
        title: "Project One",
        workspaceRoot: "/workspace/project-1",
        repositoryIdentity: null,
        defaultModelSelection: null,
        scripts: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ),
  getFirstActiveThreadIdByProjectId: () => Effect.die("unused"),
  getThreadCheckpointContext: () => Effect.die("unused"),
  getFullThreadDiffContext: () => Effect.die("unused"),
  getThreadShellById: () => Effect.die("unused"),
  getThreadDetailById: () =>
    Effect.succeed(
      Option.some({
        id: threadId,
        projectId,
        title: "Original title",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4-mini" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        archivedAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      }),
    ),
};

type BrokerLayerStartChildServices = Layer.Layer<
  | FileSystem.FileSystem
  | Path.Path
  | GitWorkflowService
  | SourceControlProviderRegistry
  | ProjectSetupScriptRunner,
  never,
  never
>;

type BrokerLayerOptions = {
  readonly includeStartChildServices?: boolean;
  readonly startChildServicesLayer?: BrokerLayerStartChildServices;
};

function makeBrokerLayerBase(
  orchestrationMock: OrchestrationEngineShape,
  contextRefreshLayer: Layer.Layer<T3workContextRefreshService, never, never>,
  options: BrokerLayerOptions = {},
) {
  const sharedRuntime = Layer.mergeAll(
    Layer.succeed(ProjectionSnapshotQuery, projectionQueryMock),
    Layer.succeed(OrchestrationEngineService, orchestrationMock),
    T3workThreadToolContextStoreLive,
    contextRefreshLayer,
    stubWorkspacePathsLayer,
    ...(options.includeStartChildServices === false
      ? [stubFileSystemPathLayer]
      : [options.startChildServicesLayer ?? stubStartChildServices]),
  );

  return T3workToolBrokerLive.pipe(Layer.provide(sharedRuntime), Layer.provideMerge(sharedRuntime));
}

export const makeBrokerLayer = (orchestrationMock: OrchestrationEngineShape) =>
  makeBrokerLayerWithOptions(orchestrationMock);

export const makeBrokerLayerWithOptions = (
  orchestrationMock: OrchestrationEngineShape,
  options: BrokerLayerOptions = {},
) =>
  makeBrokerLayerBase(
    orchestrationMock,
    Layer.succeed(T3workContextRefreshService, NoopT3workContextRefreshService),
    options,
  );

export const makeBrokerLayerWithLiveContextRefresh = (
  orchestrationMock: OrchestrationEngineShape,
  options: BrokerLayerOptions & { readonly contextRefreshLayerPrefix?: string } = {},
) =>
  makeBrokerLayerBase(
    orchestrationMock,
    makeContextRefreshLiveLayer(options.contextRefreshLayerPrefix).pipe(Layer.orDie),
    options,
  );
