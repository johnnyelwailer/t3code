/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * Real-path proof for the workflow-engine resume reactor (Epic 25 §Host wiring, Phase A).
 *
 * The existing launch + durability tests PLAY the reactor's role by hand (`takePending` +
 * `resume`). This test does NOT: it boots the REAL OrchestrationEngine + event store +
 * projection pipeline + the production `T3TeamWorkflowEngineReactorLive`, the same wiring
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

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

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
import * as ThreadBackgroundLiveness from "./orchestration/ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "./orchestration/ThreadPlanProgress.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "./config.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { T3TeamWorkflowEngineReactorLive } from "./t3team-workflowEngineReactor.ts";
import {
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
} from "./t3team-workflowEngineRegistry.ts";
import { stubAgentTurnCommands } from "./t3team-workflowStubAgentTurn.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-exampleReview.workflow.ts", import.meta.url),
);
const parallelWorkflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-parallelAgentsAfterResume.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-reactor-"));

const projectId = ProjectId.make("proj-reactor");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-06-09T00:00:00.000Z";

/**
 * The stub provider adapter. A real provider, on the engine's `thread.turn-start-requested`
 * event, starts a turn, streams an assistant message back, and ends the turn;
 * `ProviderRuntimeIngestion` turns that into a `thread.session.set` with the turn active, the
 * `thread.message.assistant.delta` (streaming) + `thread.message.assistant.complete` pair, and a
 * `thread.session.set` with no active turn. We emit exactly those (see
 * `t3team-workflowStubAgentTurn.ts`) — splitting the JSON reply across two deltas so the
 * reactor's delta-concatenation path is exercised — for every turn the workflow starts.
 */
const StubProviderDriverLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    yield* Effect.forkScoped(
      Stream.runForEach(orchestration.streamDomainEvents, (event) => {
        if (event.type !== "thread.turn-start-requested") return Effect.void;
        const { threadId, messageId: turnMessageId } = event.payload;
        // A real assistant reply for the `agent(..., { schema: Summary })` call, streamed in two
        // chunks; concatenated they form the JSON the SDK parses + validates.
        const commands = stubAgentTurnCommands({
          threadId,
          idPrefix: `stub:${turnMessageId}`,
          messages: [['{"summary":"Low risk;', ' well tested."}']],
          createdAt: ISO,
        });
        return Effect.forEach(commands, (command) => orchestration.dispatch(command), {
          concurrency: 1,
          discard: true,
        }).pipe(Effect.orDie);
      }),
    );
  }),
);

const EngineLive = OrchestrationEngineLive.pipe(
  // Upstream's shell mapper reads background liveness + plan progress per thread;
  // both are provided INTO the snapshot query so the requirement is discharged here.
  Layer.provide(
    OrchestrationProjectionSnapshotQueryLive.pipe(
      Layer.provide(ThreadBackgroundLiveness.layer),
      Layer.provide(ThreadPlanProgress.layer),
    ),
  ),
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
const TestLayer = Layer.mergeAll(T3TeamWorkflowEngineReactorLive, StubProviderDriverLive).pipe(
  Layer.provideMerge(Layer.merge(EngineLive, T3TeamWorkflowEngineRegistryLive)),
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
      const registry = yield* T3TeamWorkflowEngineRegistry;

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
      // Step activities (UX slice 1) interleave with the orchestration commands; the launch
      // contract is asserted on the non-activity stream.
      assert.deepStrictEqual(
        dispatched.filter((type) => type !== "thread.activity.append").slice(0, 2),
        ["thread.create", "thread.turn.start"],
      );

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

      // A duplicated/late user event cannot settle the consumed ask again.
      yield* orchestration.dispatch({
        type: "thread.message.upsert",
        commandId: CommandId.make("reactor-user-reply-duplicate"),
        threadId: ThreadId.make(launchThreadId),
        message: {
          messageId: MessageId.make("reactor-user-reply-msg-duplicate"),
          role: "user",
          text: '{"merge":false}',
          turnId: null,
          streaming: false,
        },
        createdAt: ISO,
      });
      yield* Effect.sleep(Duration.millis(20));
      assert.strictEqual(completed.length, 1);
    }).pipe(Effect.provide(TestLayer)),
);

it.live("settles all parallel live agent replies while the parent replay is in progress", () =>
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    yield* Effect.sleep(Duration.millis(100));

    const runId = "reactor-parallel-run";
    const launchThreadId = "reactor-parallel-launch";
    yield* orchestration.dispatch({
      type: "project.create",
      commandId: CommandId.make("reactor-parallel-project"),
      projectId,
      title: "Parallel Reactor Project",
      workspaceRoot: "/tmp/reactor-parallel-project",
      defaultModelSelection: modelSelection,
      createdAt: ISO,
    });
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make("reactor-parallel-launch-thread"),
      threadId: ThreadId.make(launchThreadId),
      projectId,
      title: "Parallel launch thread",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: ISO,
    });

    const commands: OrchestrationCommand[] = [];
    const completed: unknown[] = [];
    const errors: unknown[] = [];
    let seq = 0;
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId,
        workflowPath: parallelWorkflowPath,
        args: {},
        runsRoot,
        launchThreadId,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry,
        dispatch: (command) => {
          commands.push(command);
          return Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);
        },
        newId: () => `parallel-id-${(seq += 1)}`,
        nowIso: () => ISO,
        onComplete: async (output) => {
          completed.push(output);
        },
        onError: async (error) => {
          errors.push(error);
        },
      }),
    );
    assert.strictEqual(launched.status, "suspended");

    yield* waitUntil(
      () => completed.length === 1 || errors.length === 1,
      "parallel live children to settle",
    );
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(completed[0], { count: 3 });
    assert.strictEqual(
      commands.filter((command) => command.type === "thread.turn.start").length,
      4,
    );
    assert.isTrue(
      commands.some(
        (command) =>
          command.type === "thread.message.upsert" &&
          command.message.text === "Parallel children complete",
      ),
    );
    assert.isUndefined(registry.getRun(runId));
  }).pipe(Effect.provide(TestLayer)),
);

afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));
