import { expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import {
  CheckpointScopeId,
  MessageId,
  RunAttemptId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";

import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as GitWorkflow from "../git/GitWorkflowService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ProviderAuthService from "../provider/ProviderAuthService.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ContextHandoffService from "./ContextHandoffService.ts";
import * as EventSink from "./EventSink.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderSessionManager from "./ProviderSessionManager.ts";
import * as ProviderTurnStart from "./ProviderTurnStartService.ts";
import * as RunExecutionService from "./RunExecutionService.ts";
import * as RuntimePolicy from "./RuntimePolicy.ts";
import { ColdLocalCompaction } from "./t3team-coldLocalCompaction.ts";
import {
  claudeInstanceId,
  compactionRun,
  conversationItems,
  isoAt,
  nativeThread,
  previousRun,
  projectionWithUsage,
  providerThreadId,
  rootNodeId,
  route,
  threadId,
} from "./t3team-coldLocalCompaction.fixtures.ts";

const attemptId = RunAttemptId.make("attempt:compaction");
const checkpointScopeId = CheckpointScopeId.make("scope:cold-compaction");
const at = DateTime.makeUnsafe("2026-10-13T08:00:00.000Z");
const ago = (ms: number) => isoAt(DateTime.toEpochMillis(DateTime.nowUnsafe()) - ms);
const COLD = ago(60 * 60 * 1000);
const WARM = ago(30 * 1000);

function makeHarness(input: {
  readonly reportedAt: string;
  readonly hasRoute?: boolean;
  readonly handoffService?: Layer.Layer<ContextHandoffService.ContextHandoffServiceV2>;
}) {
  const run = { ...compactionRun, activeAttemptId: attemptId };
  const usage = projectionWithUsage(150_000, input.reportedAt, [previousRun, run]);
  let projection: OrchestrationV2ThreadProjection = {
    thread: {
      id: threadId,
      activeProviderThreadId: providerThreadId,
      branch: null,
      worktreePath: null,
      lineage: { parentThreadId: null, relationshipToParent: null },
    } as OrchestrationV2ThreadProjection["thread"],
    ...usage,
    attempts: [
      ...usage.attempts,
      {
        id: attemptId,
        runId: run.id,
        rootNodeId,
        attemptOrdinal: 1,
        providerInstanceId: claudeInstanceId,
        providerThreadId,
        providerTurnId: null,
        reason: "initial",
        status: "pending",
        startedAt: null,
        completedAt: null,
      },
    ],
    nodes: [
      {
        id: rootNodeId,
        threadId,
        runId: run.id,
        parentNodeId: null,
        rootNodeId,
        kind: "root_turn",
        status: "pending",
        countsForRun: true,
        providerThreadId,
        providerTurnId: null,
        nativeItemRef: null,
        runtimeRequestId: null,
        checkpointScopeId,
        startedAt: null,
        completedAt: null,
      },
    ],
    providerThreads: [nativeThread],
    messages: [previousRun.userMessageId, run.userMessageId].map((id, index) => ({
      id: MessageId.make(id),
      threadId,
      runId: index === 0 ? previousRun.id : run.id,
      nodeId: rootNodeId,
      role: "user" as const,
      text: index === 0 ? "Rename the exporter" : "/compact",
      attachments: [],
      streaming: false,
      createdBy: "user" as const,
      creationSource: "web" as const,
      createdAt: at,
      updatedAt: at,
    })),
    checkpointScopes: [
      {
        id: checkpointScopeId,
        threadId,
        runId: run.id,
        nodeId: rootNodeId,
        parentScopeId: null,
        providerThreadId,
        kind: "root_run",
        ordinalWithinParent: 0,
        advancesAppRunCount: true,
        cwd: "/tmp/cold-local-compaction",
        createdAt: at,
      },
    ],
    providerSessions: [],
    contextHandoffs: [],
    contextTransfers: [],
    turnItems: [],
    visibleTurnItems: [],
    runtimeRequests: [],
    subagents: [],
    plans: [],
    checkpoints: [],
    updatedAt: at,
  };
  const readProjection = Effect.sync(() => ({ ...projection, hasConversation: true }));
  const open = vi.fn(() =>
    Effect.fail(
      new ProviderSessionManager.ProviderSessionOpenError({
        instanceId: claudeInstanceId,
        providerSessionId: nativeThread.providerSessionId!,
        cause: "the native path opened the provider session",
      }),
    ),
  );
  const startRootRun = vi.fn(() => Effect.void);
  const summarize = vi.fn(() => Effect.succeed("Renamed the exporter."));
  const writeIfRunCurrent = vi.fn(
    ({ events }: { readonly events: ReadonlyArray<OrchestrationV2DomainEvent> }) =>
      Effect.sync(() => {
        for (const event of events) {
          projection = ProjectionStore.applyToProjection(projection, event);
        }
        return { committed: true, storedEvents: [] };
      }),
  );
  const layer = ProviderTurnStart.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        input.handoffService ?? ContextHandoffService.layer.pipe(Layer.provide(IdAllocator.layer)),
        Layer.mock(EventSink.EventSinkV2)({ writeIfRunCurrent }),
        IdAllocator.layer,
        FileSystem.layerNoop({}),
        Path.layer,
        Layer.mock(GitWorkflow.GitWorkflowService)({}),
        Layer.mock(ServerConfig.ServerConfig)({} as never),
        Layer.mock(ServerSettings.ServerSettingsService)({}),
        Layer.mock(ProjectService.ProjectService)({}),
        Layer.mock(ProjectionStore.ProjectionStoreV2)({
          getTurnStartContext: () => readProjection,
          getRuntimeRecoveryProjection: () => readProjection,
          getTurnStartHistory: () => Effect.succeed(conversationItems),
          getThreadRecords: () => readProjection as never,
        }),
        Layer.mock(ProviderSessionManager.ProviderSessionManagerV2)({ open }),
        Layer.mock(ProviderAuthService.ProviderAuthService)({
          tryHandlePromptCommand: () => Effect.succeed(false),
        }),
        Layer.mock(RunExecutionService.RunExecutionServiceV2)({ startRootRun }),
        Layer.mock(RuntimePolicy.RuntimePolicyV2)({ resolve: () => Effect.succeed({} as never) }),
        Layer.succeed(ColdLocalCompaction, {
          routeFor: () => Effect.succeed(input.hasRoute === false ? undefined : route),
          summarize,
        }),
      ),
    ),
  );
  const start = Effect.gen(function* () {
    return yield* (yield* ProviderTurnStart.ProviderTurnStartServiceV2).start({
      threadId,
      runId: run.id,
      willRetry: true,
    });
  }).pipe(
    Effect.provide(layer),
    Effect.provideService(ProviderRegistry.ProviderRegistry, {
      getProviders: Effect.succeed([]),
      refresh: () => Effect.succeed([]),
      refreshInstance: () => Effect.succeed([]),
    } as never),
  );
  return { open, startRootRun, summarize, start, projection: () => projection };
}

it.live("compacts a cold Claude thread locally without opening the provider session", () =>
  Effect.gen(function* () {
    const harness = makeHarness({ reportedAt: COLD });

    yield* harness.start;

    const settled = harness.projection();
    expect(harness.summarize).toHaveBeenCalledOnce();
    expect(harness.open).not.toHaveBeenCalled();
    expect(harness.startRootRun).not.toHaveBeenCalled();
    expect(settled.runs.at(-1)).toMatchObject({ status: "completed" });
    expect(settled.turnItems).toMatchObject([{ type: "compaction", title: "Context compacted" }]);
    expect(settled.contextHandoffs).toMatchObject([
      { strategy: "full_thread_summary", status: "ready", summaryText: "Renamed the exporter." },
    ]);
    expect(settled.providerThreads[0]).toMatchObject({
      id: providerThreadId,
      nativeThreadRef: null,
      status: "not_loaded",
    });
    expect(settled.thread.activeProviderThreadId).toBe(providerThreadId);
  }),
);

it.live.each([
  { name: "a warm thread", reportedAt: WARM },
  { name: "a thread without a registered route", reportedAt: COLD, hasRoute: false },
])("leaves $name on the native compaction path", (scenario) =>
  Effect.gen(function* () {
    const harness = makeHarness(scenario);

    const error = yield* harness.start.pipe(Effect.flip);

    expect(error._tag).toBe("ProviderTurnStartError");
    expect(harness.open).toHaveBeenCalledOnce();
    expect(harness.summarize).not.toHaveBeenCalled();
    expect(harness.projection().contextHandoffs).toEqual([]);
    expect(harness.projection().runs.at(-1)).toMatchObject({ status: "starting" });
  }),
);

it.live("falls back to the native compaction when the handoff cannot be generated", () =>
  Effect.gen(function* () {
    const harness = makeHarness({
      reportedAt: COLD,
      handoffService: Layer.mock(ContextHandoffService.ContextHandoffServiceV2)({
        prepareProviderHandoff: () => Effect.die("history cannot be rendered"),
      }),
    });

    const error = yield* harness.start.pipe(Effect.flip);

    expect(error._tag).toBe("ProviderTurnStartError");
    expect(harness.open).toHaveBeenCalledOnce();
    expect(harness.summarize).not.toHaveBeenCalled();
    expect(harness.projection().contextHandoffs).toEqual([]);
    expect(harness.projection().providerThreads[0]?.nativeThreadRef).not.toBeNull();
  }),
);
