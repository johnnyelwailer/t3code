/**
 * A delegated child routed to the `remoteEnvironment` instance, on the real orchestration V2
 * runtime and effect worker (upstream's replay harness): its turn runs on the (fake) cloud
 * session's thread, its answer lands in the local child thread, and its run completes there.
 */
import { assert, it } from "@effect/vitest";
import type { PackJson, PackTurnInput } from "@t3team/pack-api";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderContinuationRequests from "@t3tools/provider-core/server/ProviderContinuationRequests";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import * as Orchestrator from "./orchestration-v2/Orchestrator.ts";
import * as ProviderAdapterRegistry from "./orchestration-v2/ProviderAdapterRegistry.ts";
import { layerWithRegistry } from "./orchestration-v2/testkit/ProviderReplayHarness.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import {
  completedTurnEvents,
  makeScriptedPack,
  PACK_DRIVER,
} from "./t3team-pack-driver.fixtures.ts";
import { makePackOrchestrationAdapter } from "./t3team-pack-driverAdapter.ts";
import { makeRemoteEnvironmentAdapter } from "./t3team-remoteEnvironmentAdapter.ts";
import { makeRemoteEnvironmentAuthorizer } from "./t3team-remoteEnvironmentAuthorize.ts";
import { makeRemoteEnvironmentPlacements } from "./t3team-remoteEnvironmentPlacements.ts";
import { fakeRemote, REPOSITORY, view } from "./t3team-remoteEnvironmentSession.fixtures.ts";
import {
  REMOTE_ENVIRONMENT_INSTANCE_ID,
  remoteEnvironmentModelSelection,
} from "./t3team-remoteEnvironmentTarget.ts";

const parentSelection = {
  instanceId: ProviderInstanceId.make(PACK_DRIVER),
  model: "example/model",
};
const remoteModel = { instanceId: ProviderInstanceId.make("nexplore"), model: "Standard" };

const TERMINAL = new Set(["completed", "failed", "interrupted", "cancelled"]);

/** The child's first run status once it is terminal, read on each of the child's events. */
const childRunSettles = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    return yield* orchestrator.streamDomainEvents.pipe(
      Stream.filter((event) => event.threadId === threadId),
      Stream.mapEffect(() => orchestrator.getThreadProjection(threadId)),
      Stream.map((projection) => projection.runs[0]?.status ?? "missing"),
      Stream.filter((status) => TERMINAL.has(status)),
      Stream.runHead,
    );
  });

it.live("a delegated child runs its turn on the cloud session and completes here", () =>
  Effect.gen(function* () {
    const remote = yield* fakeRemote({});
    const parentPack = makeScriptedPack({
      autoComplete: false,
      session: {
        startTurn: async (turn: PackTurnInput) => {
          const running: ReadonlyArray<PackJson> = completedTurnEvents(turn).slice(0, 1);
          for (const event of running) parentPack.events.push(event);
        },
      },
    });
    const placements = yield* makeRemoteEnvironmentPlacements;
    const registry = ProviderAdapterRegistry.layerFromAdaptersEffect(
      Effect.gen(function* () {
        const requests = yield* ProviderContinuationRequests.ProviderContinuationRequests;
        const mcpSessions = yield* McpProviderSessions.McpProviderSessions;
        return [
          makePackOrchestrationAdapter({
            adapter: parentPack.instance.orchestration,
            driver: ProviderDriverKind.make(PACK_DRIVER),
            instanceId: parentSelection.instanceId,
            offerContinuation: requests.offer,
            mcpSessions,
          }),
          makeRemoteEnvironmentAdapter(REMOTE_ENVIRONMENT_INSTANCE_ID, {
            open: () => Effect.succeed(remote.api),
            authorize: makeRemoteEnvironmentAuthorizer({
              placements,
              ownSessionIds: Effect.succeed(["run-41"]),
              repositoryKeyOf: () => Effect.succeed(null),
            }),
          }),
        ];
      }),
    );
    const program = Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const parentId = ThreadId.make("thread:parent");
      yield* orchestrator.dispatch({
        type: "thread.create",
        commandId: CommandId.make("create:parent"),
        threadId: parentId,
        projectId: ProjectId.make("project:qa"),
        title: "Parent",
        modelSelection: parentSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "web",
      });
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("dispatch:parent"),
        threadId: parentId,
        messageId: MessageId.make("message:parent"),
        text: "Coordinate the work",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
        createdBy: "user",
        creationSource: "web",
      });
      const parent = yield* orchestrator.getThreadProjection(parentId);
      const parentRun = parent.runs[0];
      assert.ok(parentRun?.rootNodeId);
      const result = yield* orchestrator.dispatch({
        type: "delegated_task.request",
        commandId: CommandId.make("delegate:cloud"),
        parentThreadId: parentId,
        parentRunId: parentRun.id,
        parentNodeId: parentRun.rootNodeId,
        task: "Run the tests on the cloud session",
        modelSelection: remoteEnvironmentModelSelection({
          sessionId: "run-41",
          modelSelection: remoteModel,
        }),
        runtimeMode: "full-access",
        interactionMode: "default",
        completionWake: "always",
        createdBy: "agent",
        creationSource: "mcp",
      });
      const task = result.storedEvents.find((stored) => stored.event.type === "subagent.updated");
      const childId =
        task?.event.type === "subagent.updated" ? task.event.payload.childThreadId : null;
      assert.ok(childId);
      yield* placements.register(childId, { sessionId: "run-41", repositoryKey: REPOSITORY });
      yield* Deferred.await(remote.dispatched);
      const dispatched = yield* orchestrator.getThreadProjection(childId);
      const childMessageId = dispatched.runs[0]?.userMessageId ?? "missing";
      const settled = yield* Effect.forkChild(childRunSettles(childId));
      yield* Effect.yieldNow;
      yield* Ref.set(
        remote.state,
        view("completed", ["All tests pass on the cloud session."], false, childMessageId),
      );
      yield* Queue.offer(remote.ticks, undefined);
      assert.deepStrictEqual(yield* Fiber.join(settled), Option.some("completed"));
      const child = yield* orchestrator.getThreadProjection(childId);
      assert.isTrue(
        child.messages.some(
          (message) =>
            message.role === "assistant" && message.text === "All tests pass on the cloud session.",
        ),
      );
      assert.deepStrictEqual(yield* Ref.get(remote.log), [
        `launch:${childId}:remote-project`,
        `dispatch:${child.runs[0]?.userMessageId}:Standard`,
      ]);
    });
    yield* program.pipe(
      Effect.provide(
        layerWithRegistry({ name: "remote-environment-delegation" }, registry, {
          databaseLayer: SqlitePersistenceMemory,
        }),
      ),
    );
  }).pipe(Effect.scoped),
);
