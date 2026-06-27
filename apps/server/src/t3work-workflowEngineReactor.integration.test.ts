// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * Real-path proof for the workflow-engine resume reactor (Epic 25 §Host wiring, Phase A).
 *
 * The existing launch + durability tests PLAY the reactor's role by hand (`takePending` +
 * `resume`). This test does NOT: it boots the REAL OrchestrationEngine + event store +
 * projection pipeline + the production `T3workWorkflowEngineReactorLive`, the same wiring
 * `server.ts` uses, over `SqlitePersistenceMemory`, and drives the example recipe's
 * suspend→resume loop SOLELY through orchestration domain events.
 *
 * A stub provider stands in for a real adapter: on the `thread.turn-start-requested` domain
 * event the engine emits for an agent turn, it dispatches the SAME `thread.message.assistant.delta`
 * (streaming) + `thread.message.assistant.complete` commands a real `ProviderRuntimeIngestion`
 * would — so the workflow reactor sees real-shaped `thread.message-sent` events (the reply text
 * on the `streaming: true` deltas, an empty `streaming: false` marker to close the message).
 *
 * The assertion is that the run advances end to end with nobody manually resolving:
 *   1. launch → `agent()` dispatches thread.create + thread.turn.start → suspends.
 *   2. stub emits the streamed reply + completion marker → the REAL reactor assembles the delta
 *      text, matches the pending `thread.turn`, and resumes the run.
 *   3. the run advances to `thread.askUser` → suspends on `user.input`.
 *   4. a real user-message domain event lands on the launch thread → the REAL reactor resolves
 *      `user.input` → resume → the run completes with the schema-validated result.
 *
 * Regression guard for the Part 1 bug: the final assistant `thread.message-sent` carries
 * `text: ""`; reading it directly would resolve every agent turn with the empty string. The
 * reactor instead assembles the reply from the streaming deltas — split across two chunks here
 * to exercise the concatenation path.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import {
  CommandId,
  MessageId,
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { OrchestrationCommandReceiptRepositoryLive } from "./persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "./persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { OrchestrationEngineLive } from "./orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "./config.ts";
import { launchWorkflowRecipe } from "./t3work-workflowEngineLaunch.ts";
import { T3workWorkflowEngineReactorLive } from "./t3work-workflowEngineReactor.ts";
import {
  T3workWorkflowEngineRegistry,
  T3workWorkflowEngineRegistryLive,
} from "./t3work-workflowEngineRegistry.ts";

const workflowPath = fileURLToPath(
  new URL("../__fixtures__/t3work-exampleReview.workflow.ts", import.meta.url),
);
const runsRoot = mkdtempSync(join(tmpdir(), "t3work-reactor-"));

const projectId = ProjectId.make("proj-reactor");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-06-09T00:00:00.000Z";

/**
 * The stub provider adapter. A real provider, on the engine's `thread.turn-start-requested`
 * event, runs a turn and streams an assistant message back; `ProviderRuntimeIngestion` turns
 * that into `thread.message.assistant.delta` (streaming) + `thread.message.assistant.complete`
 * commands. We emit exactly those — splitting the JSON reply across two deltas so the reactor's
 * delta-concatenation path is exercised — for every turn the workflow starts.
 */
const StubProviderDriverLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    yield* Effect.forkScoped(
      Stream.runForEach(orchestration.streamDomainEvents, (event) => {
        if (event.type !== "thread.turn-start-requested") return Effect.void;
        const { threadId, messageId: turnMessageId } = event.payload;
        const assistantMessageId = MessageId.make(`stub-assistant:${turnMessageId}`);
        const turnId = TurnId.make(`stub-turn:${turnMessageId}`);
        // A real assistant reply for the `agent(..., { schema: Summary })` call, streamed in two
        // chunks; concatenated they form the JSON the SDK parses + validates.
        const chunks = ['{"summary":"Low risk;', ' well tested."}'];
        return Effect.gen(function* () {
          for (let i = 0; i < chunks.length; i += 1) {
            yield* orchestration.dispatch({
              type: "thread.message.assistant.delta",
              commandId: CommandId.make(`stub:delta:${turnMessageId}:${i}`),
              threadId,
              messageId: assistantMessageId,
              delta: chunks[i]!,
              turnId,
              createdAt: ISO,
            });
          }
          yield* orchestration.dispatch({
            type: "thread.message.assistant.complete",
            commandId: CommandId.make(`stub:complete:${turnMessageId}`),
            threadId,
            messageId: assistantMessageId,
            turnId,
            createdAt: ISO,
          });
        }).pipe(Effect.orDie);
      }),
    );
  }),
);

const EngineLive = OrchestrationEngineLive.pipe(
  Layer.provide(OrchestrationProjectionSnapshotQueryLive),
  Layer.provide(OrchestrationProjectionPipelineLive),
  Layer.provide(OrchestrationEventStoreLive),
  Layer.provide(OrchestrationCommandReceiptRepositoryLive),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-workflow-reactor-" })),
  Layer.provideMerge(NodeServices.layer),
);

// The reactor + stub are consumers of the engine (+ the shared registry the reactor and launch
// both use); `provideMerge` keeps the engine + registry in the output for the test body. The
// reactor/stub forked fibers live for the duration of the provided effect.
const TestLayer = Layer.mergeAll(T3workWorkflowEngineReactorLive, StubProviderDriverLive).pipe(
  Layer.provideMerge(Layer.merge(EngineLive, T3workWorkflowEngineRegistryLive)),
);

/** Poll an in-memory predicate (observe-only; never resolves an ask) until it holds or times out. */
const waitUntil = (predicate: () => boolean, label: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let i = 0; i < 1000; i += 1) {
      if (predicate()) return;
      yield* Effect.sleep(Duration.millis(5));
    }
    return yield* Effect.die(new Error(`timed out waiting for: ${label}`));
  });

// `it.live` (real clock) so the `Effect.sleep` polls advance; under the default TestClock they
// would never tick. The layer is provided per-test so the reactor/stub fibers + engine are fresh.
it.live(
  "workflow-engine reactor drives suspend→resume END TO END off domain events, with nobody manually resolving",
  () =>
    Effect.gen(function* () {
      const orchestration = yield* OrchestrationEngineService;
      const registry = yield* T3workWorkflowEngineRegistry;

      // Let the forked reactor + stub subscribe to the hot `streamDomainEvents` PubSub before
      // any event is dispatched (subscribers created after a publish miss it).
      yield* Effect.sleep(Duration.millis(100));

      const runId = "reactor-run";
      const launchThreadId = "reactor-launch";
      const args = { prTitle: "Fix the billing rounding bug" };

      // Seed the project + launch thread: thread.create requires the project, and the askUser
      // system message + the user reply require the launch thread to exist.
      yield* orchestration.dispatch({
        type: "project.create",
        commandId: CommandId.make("reactor-project"),
        projectId,
        title: "Reactor Project",
        workspaceRoot: "/tmp/reactor-project",
        defaultModelSelection: modelSelection,
        createdAt: ISO,
      });
      yield* orchestration.dispatch({
        type: "thread.create",
        commandId: CommandId.make("reactor-launch-thread"),
        threadId: ThreadId.make(launchThreadId),
        projectId,
        title: "Launch thread",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt: ISO,
      });

      const dispatched: string[] = [];
      const completed: unknown[] = [];
      let seq = 0;
      const dispatch = (command: OrchestrationCommand): Promise<void> => {
        dispatched.push(command.type);
        return Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);
      };

      // ── 1. Launch: agent() dispatches thread.create + thread.turn.start, then suspends. ──
      const launched = yield* Effect.promise(() =>
        launchWorkflowRecipe({
          runId,
          workflowPath,
          args,
          runsRoot,
          launchThreadId,
          projectId,
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          registry,
          dispatch,
          newId: () => `id-${(seq += 1)}`,
          nowIso: () => ISO,
          onComplete: async (output) => {
            completed.push(output);
          },
        }),
      );
      assert.strictEqual(launched.status, "suspended");
      assert.deepStrictEqual(dispatched.slice(0, 2), ["thread.create", "thread.turn.start"]);

      // ── 2 + 3. The stub's turn-done events drive the REAL reactor: it assembles the delta
      // text, resolves the agent turn, and the run advances to askUser → parks on user.input.
      // Reaching this state proves the agent turn resolved purely from domain events. ──
      yield* waitUntil(
        () => registry.peekPending(launchThreadId)?.kind === "user.input",
        "run to advance past agent() and suspend on askUser",
      );
      // Resuming fired the askUser escalation as a system message into the launch thread.
      assert.isTrue(dispatched.includes("thread.message.upsert"));
      // The run is parked (not yet completed) awaiting the user.
      assert.isDefined(registry.getRun(runId));
      assert.strictEqual(completed.length, 0);

      // ── 4. A real user-message domain event lands on the launch thread. NOTHING here calls
      // takePending/resume — the reactor must catch this event and resolve user.input. ──
      yield* orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make("reactor-user-reply"),
        threadId: ThreadId.make(launchThreadId),
        message: {
          messageId: MessageId.make("reactor-user-reply-msg"),
          role: "user",
          text: '{"merge":true}',
          turnId: null,
          streaming: false,
        },
        createdAt: ISO,
      });

      yield* waitUntil(() => completed.length > 0, "run to complete after the user reply");

      // ── Completed end to end with the schema-validated result; the run is unregistered. ──
      assert.deepStrictEqual(completed[0], {
        summary: "Low risk; well tested.",
        merged: true,
      });
      assert.isUndefined(registry.getRun(runId));
    }).pipe(Effect.provide(TestLayer)),
);

afterAll(() => rmSync(runsRoot, { recursive: true, force: true }));
