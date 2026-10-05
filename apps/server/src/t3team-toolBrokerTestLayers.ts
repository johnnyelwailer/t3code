/**
 * Test layers for the live t3team tool broker over V2 fakes: one thread
 * ("thread-1") in one project ("project-1"), command dispatch recorded through
 * the caller's `dispatch`, and stub filesystem/path services.
 */
import {
  type OrchestrationProjectShell,
  type OrchestrationV2AppThread,
  type OrchestrationV2ServerCommand,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import {
  NoopT3TeamContextRefreshService,
  T3TeamContextRefreshService,
} from "./t3team-contextRefreshService.ts";
import { makeContextRefreshLiveLayer } from "./t3team-contextRefreshTestFixtures.ts";
import { T3TeamThreadToolContextStoreLive } from "./t3team-threadToolContextStore.ts";
import { T3TeamToolBrokerLive } from "./t3team-toolBrokerLive.ts";
import {
  type T3TeamThreadArtifactInput,
  T3TeamThreadArtifactsStore,
} from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

export type TestDispatch = (command: OrchestrationV2ServerCommand) => Effect.Effect<unknown>;

export interface BrokerLayerOptions {
  /** Sees every thread artifact the broker writes (a published draft, a widget). */
  readonly onArtifact?: (artifact: T3TeamThreadArtifactInput) => void;
}

const threadId = ThreadId.make("thread-1");
const projectId = ProjectId.make("project-1");
const epoch = DateTime.makeUnsafe(Date.parse("2026-01-01T00:00:00.000Z"));

export const testBrokerThread = {
  id: threadId,
  projectId,
  title: "Original title",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4-mini" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
  createdAt: epoch,
  updatedAt: epoch,
  deletedAt: null,
} as unknown as OrchestrationV2AppThread;

export const testBrokerProject = {
  id: projectId,
  title: "Project One",
  workspaceRoot: "/workspace/project-1",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as OrchestrationProjectShell;

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
const stubFileSystemPathLayer = Layer.mergeAll(
  Layer.succeed(FileSystem.FileSystem, {} as FileSystem.FileSystem),
  stubPathLayer,
);

const v2Fakes = (dispatch: TestDispatch, options: BrokerLayerOptions) =>
  Layer.mergeAll(
    Layer.mock(ThreadManagementService)({
      getThreadRecords: ((id: ThreadId) =>
        id === threadId
          ? Effect.succeed({ thread: testBrokerThread, messages: [], turnItems: [] })
          : Effect.die(`unknown thread ${id}`)) as never,
      getMessageCount: () => Effect.succeed(0),
      getThreadShell: (id) =>
        Effect.succeed(
          id === threadId
            ? ({ ...testBrokerThread, status: "idle", latestRunId: null } as never)
            : null,
        ),
      listProjectThreads: () => Effect.succeed([]),
      dispatch: (command) =>
        dispatch(command).pipe(Effect.as({ sequence: 1, storedEvents: [] } as never)),
    }),
    Layer.mock(ProjectStoreV2)({
      getShell: (id) =>
        Effect.succeed(id === projectId ? Option.some(testBrokerProject) : Option.none()),
    }),
    Layer.mock(T3TeamThreadFactsStore)({ list: () => Effect.succeed([]) }),
    // Widgets and draft mutations are recorded as thread artifacts; accept every write.
    Layer.mock(T3TeamThreadArtifactsStore)({
      upsert: (input) =>
        Effect.sync(() => {
          options.onArtifact?.(input);
          return {
            ...input,
            messageId: input.messageId ?? null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          };
        }),
    }),
  );

function makeBrokerLayerBase(
  dispatch: TestDispatch,
  contextRefreshLayer: Layer.Layer<T3TeamContextRefreshService, never, never>,
  options: BrokerLayerOptions = {},
) {
  return T3TeamToolBrokerLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        v2Fakes(dispatch, options),
        contextRefreshLayer,
        T3TeamThreadToolContextStoreLive,
        WorkspacePaths.layer.pipe(Layer.provide(stubFileSystemPathLayer)),
        stubFileSystemPathLayer,
      ),
    ),
  );
}

const noDispatch: TestDispatch = () => Effect.void;

export const makeBrokerLayer = (
  dispatch: TestDispatch = noDispatch,
  options: BrokerLayerOptions = {},
) =>
  makeBrokerLayerBase(
    dispatch,
    Layer.succeed(T3TeamContextRefreshService, NoopT3TeamContextRefreshService),
    options,
  );

export const makeBrokerLayerWithLiveContextRefresh = (
  dispatch: TestDispatch = noDispatch,
  options: { readonly contextRefreshLayerPrefix?: string } = {},
) =>
  makeBrokerLayerBase(
    dispatch,
    makeContextRefreshLiveLayer(options.contextRefreshLayerPrefix).pipe(Layer.orDie),
  );
