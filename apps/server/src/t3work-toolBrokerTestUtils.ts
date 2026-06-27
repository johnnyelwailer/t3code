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
import { T3workToolBrokerLive } from "./t3work-toolBrokerLive.ts";

export const threadId = ThreadId.make("thread-1");

type TestToolContextTool = {
  id: string;
  label: string;
  capabilities: ReadonlyArray<"read" | "write">;
};

export function createThreadToolContext(input: {
  readonly tools: ReadonlyArray<TestToolContextTool>;
  readonly view?: Partial<{
    kind: "thread";
    projectId: string;
    projectTitle: string;
    workspaceRoot: string;
    threadId: ThreadId;
    threadTitle: string;
    ticketId: string;
    displayMode: "thread" | "embedded";
  }>;
}) {
  return {
    surface: "t3work" as const,
    tools: [...input.tools],
    state: {
      view: {
        kind: "thread" as const,
        projectId: "project-1",
        projectTitle: "Project One",
        workspaceRoot: "/workspace/project-1",
        threadId,
        threadTitle: "Original title",
        ...input.view,
      },
    },
  };
}

export function joinPosix(...segments: ReadonlyArray<string>): string {
  const normalized = segments
    .filter((segment) => segment.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function dirnamePosix(value: string): string {
  const normalized = value.replace(/\/+/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  return lastSlashIndex <= 0 ? "/" : normalized.slice(0, lastSlashIndex);
}

const projectId = ProjectId.make("project-1");
const stubStartChildServices = Layer.mergeAll(
  Layer.succeed(FileSystem.FileSystem, {} as FileSystem.FileSystem),
  Layer.succeed(Path.Path, {} as Path.Path),
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

export const makeBrokerLayer = (orchestrationMock: OrchestrationEngineShape) =>
  makeBrokerLayerWithOptions(orchestrationMock);

export const makeBrokerLayerWithOptions = (
  orchestrationMock: OrchestrationEngineShape,
  options: {
    readonly includeStartChildServices?: boolean;
    readonly startChildServicesLayer?: Layer.Layer<
      | FileSystem.FileSystem
      | Path.Path
      | GitWorkflowService
      | SourceControlProviderRegistry
      | ProjectSetupScriptRunner,
      never,
      never
    >;
  } = {},
) =>
  T3workToolBrokerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ProjectionSnapshotQuery, projectionQueryMock),
        Layer.succeed(OrchestrationEngineService, orchestrationMock),
        T3workThreadToolContextStoreLive,
        ...(options.includeStartChildServices === false
          ? []
          : [options.startChildServicesLayer ?? stubStartChildServices]),
      ),
    ),
  );
