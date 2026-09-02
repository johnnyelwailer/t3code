/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- the launch API is promise-shaped; the engine layer is bridged once, like its siblings. */
// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * WHICH message of an agent turn an `askAgent` resolves with — the regression proof for the live
 * failure this branch fixes.
 *
 * A `describe-rewrite` run resolved its writer step with the agent's FIRST message, a German
 * preamble ("Ich hole erst den Kontext zum Item…"), published that sentence as the proposed
 * description, and reported `completed` while the real turn streamed for three more minutes. So
 * these tests drive the REAL reactor over the REAL orchestration engine + projection pipeline and
 * assert on the two shapes that matter:
 *
 *   1. preamble → tool activity → the real answer  ⇒  the run's output is the REAL ANSWER;
 *   2. a turn that ends with no assistant text     ⇒  the run FAILS (never resolves with "").
 *
 * The stub provider emits exactly the commands `ProviderRuntimeIngestion` dispatches for a turn
 * (see `t3team-workflowStubAgentTurn.ts`), so nothing here plays the reactor's part by hand.
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
  EventId,
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
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationCommandReceiptRepositoryLive } from "./persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "./persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { WorkflowRunRepositoryLive } from "./persistence/Layers/WorkflowRuns.ts";
import { OrchestrationEngineLive } from "./orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./orchestration/Layers/ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "./orchestration/ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "./orchestration/ThreadPlanProgress.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "./config.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { T3TeamWorkflowEngineReactorLive } from "./t3team-workflowEngineReactor.ts";
import {
  T3TeamWorkflowEngineRegistry,
  T3TeamWorkflowEngineRegistryLive,
  type T3TeamWorkflowEngineRegistryShape,
} from "./t3team-workflowEngineRegistry.ts";
import { stubAgentTurnCommands } from "./t3team-workflowStubAgentTurn.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-writerTurn.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-turn-answer-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

// Shorten the interrupted-step re-drive backoff for the restart-recovery tests below (same
// env-override pattern as the transient turn retry's e2e knob). Inert for the tests that never
// enter the retry path (live asks with an author fail fast).
process.env.T3TEAM_INTERRUPTED_TURN_RETRY_BACKOFF_MS = "25";

const projectId = ProjectId.make("proj-turn-answer");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-07-28T00:00:00.000Z";

const PREAMBLE =
  "Ich hole erst den Kontext zum Item: Parent, Kinder, Kommentare, Links. Dann schreibe ich nur die neue Beschreibung.";
const ANSWER = "## Goal\nCheckout must round to two decimals.";

/** A stub provider whose Nth turn on a thread emits the Nth scripted message list (last
 * script repeats), with a tool activity between the first two messages of multi-message turns. */
const ScriptedStubProviderLive = (scripts: ReadonlyArray<ReadonlyArray<ReadonlyArray<string>>>) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const orchestration = yield* OrchestrationEngineService;
      const turnsByThread = new Map<string, number>();
      yield* Effect.forkScoped(
        Stream.runForEach(orchestration.streamDomainEvents, (event) => {
          if (event.type !== "thread.turn-start-requested") return Effect.void;
          const { threadId, messageId: turnMessageId } = event.payload;
          const attempt = turnsByThread.get(threadId) ?? 0;
          turnsByThread.set(threadId, attempt + 1);
          // The attempt counter in the prefix keeps re-issued turns' command ids unique — a
          // resume re-runs the SAME user message, so the raw message id would collide with the
          // first turn's command ids and the receipt dedupe would drop the second turn.
          const idPrefix = `stub:${turnMessageId}:${attempt}`;
          const messages = scripts[Math.min(attempt, scripts.length - 1)] ?? [];
          const commands = stubAgentTurnCommands({ threadId, idPrefix, messages, createdAt: ISO });
          // A tool call in the middle of the turn: the reactor must not read it as an answer,
          // and must not settle the ask while the turn keeps working.
          if (messages.length >= 2) {
            const toolActivity: OrchestrationCommand = {
              type: "thread.activity.append",
              commandId: CommandId.make(`${idPrefix}:tool`),
              threadId,
              activity: {
                id: EventId.make(`${idPrefix}:tool-activity`),
                tone: "tool",
                kind: "tool.completed",
                summary: "Read .t3team/context/work-items/t3-42.json",
                payload: { itemType: "file_read" },
                turnId: TurnId.make(`${idPrefix}:turn`),
                createdAt: ISO,
              },
              createdAt: ISO,
            };
            // …dispatched after the first message completes, before the rest of the turn.
            const insertAt = 3;
            return Effect.forEach(
              [...commands.slice(0, insertAt), toolActivity, ...commands.slice(insertAt)],
              (command) => orchestration.dispatch(command),
              { concurrency: 1, discard: true },
            ).pipe(Effect.orDie);
          }
          return Effect.forEach(commands, (command) => orchestration.dispatch(command), {
            concurrency: 1,
            discard: true,
          }).pipe(Effect.orDie);
        }),
      );
    }),
  );

// The reactor's read-side services (snapshot query + run repo) are provided INTO the engine
// alongside its other stores, so they share the engine's own in-memory database: the re-drive
// prompt lookup reads the projection the engine wrote, and the restart-recovery tests assert
// the journaled re-drive counter against the same `workflow_runs` row the reactor wrote.
const EngineLive = OrchestrationEngineLive.pipe(
  Layer.provide(ThreadBackgroundLiveness.layer),
  // `provideMerge` (not `provide`): the test body reads the PROJECTED thread detail — the same
  // source the client snapshot is built from — to assert what a client can actually see.
  // Upstream's shell mapper reads background liveness + plan progress per thread;
  // both are provided INTO the snapshot query so the requirement is discharged here.
  Layer.provideMerge(
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
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-turn-answer-" })),
  Layer.provideMerge(NodeServices.layer),
);

const testLayer = (scripts: ReadonlyArray<ReadonlyArray<ReadonlyArray<string>>>) =>
  Layer.mergeAll(T3TeamWorkflowEngineReactorLive, ScriptedStubProviderLive(scripts)).pipe(
    Layer.provideMerge(
      Layer.merge(
        EngineLive,
        Layer.merge(
          T3TeamWorkflowEngineRegistryLive,
          Layer.merge(
            OrchestrationProjectionSnapshotQueryLive.pipe(
              Layer.provide(ThreadBackgroundLiveness.layer),
              Layer.provide(ThreadPlanProgress.layer),
              Layer.provide(RepositoryIdentityResolver.layer),
              Layer.provideMerge(SqlitePersistenceMemory),
              Layer.provideMerge(NodeServices.layer),
            ),
            WorkflowRunRepositoryLive.pipe(
              Layer.provideMerge(SqlitePersistenceMemory),
              Layer.provideMerge(NodeServices.layer),
            ),
          ),
        ),
      ),
    ),
  );

/** Poll an in-memory predicate (observe-only; never resolves an ask) until it holds or times out. */
const waitUntil = (predicate: () => boolean, label: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (let i = 0; i < 2000; i += 1) {
      if (predicate()) return;
      yield* Effect.sleep(Duration.millis(5));
    }
    return yield* Effect.die(new Error(`timed out waiting for: ${label}`));
  });

const seedProjectAndThread = (launchThreadId: string) =>
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    yield* orchestration.dispatch({
      type: "project.create",
      commandId: CommandId.make(`${launchThreadId}-project`),
      projectId,
      title: "Turn Answer Project",
      workspaceRoot: "/tmp/turn-answer-project",
      defaultModelSelection: modelSelection,
      createdAt: ISO,
    });
    yield* orchestration.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`${launchThreadId}-thread`),
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
  });

const launch = (input: { readonly runId: string; readonly launchThreadId: string }) =>
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const completed: unknown[] = [];
    const errors: unknown[] = [];
    const dispatched: OrchestrationCommand[] = [];
    let seq = 0;
    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId: input.runId,
        workflowPath,
        args: {},
        runsRoot,
        launchThreadId: input.launchThreadId,
        projectId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry,
        dispatch: (command) => {
          dispatched.push(command);
          return Effect.runPromise(orchestration.dispatch(command)).then(() => undefined);
        },
        newId: () => `${input.runId}-id-${(seq += 1)}`,
        nowIso: () => ISO,
        onComplete: async (output) => {
          completed.push(output);
        },
        onError: async (error) => {
          errors.push(error);
        },
      }),
    );
    return { launched, completed, errors, dispatched, registry };
  });

it.live("resolves askAgent with the turn's FINAL answer, not the preamble it opened with", () =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(100));
    const launchThreadId = "turn-answer-launch";
    yield* seedProjectAndThread(launchThreadId);
    const run = yield* launch({ runId: "turn-answer-run", launchThreadId });
    assert.strictEqual(run.launched.status, "suspended");

    yield* waitUntil(
      () => run.completed.length > 0 || run.errors.length > 0,
      "the writer run to settle",
    );
    assert.deepStrictEqual(run.errors, []);
    // THE regression: the first message must not have settled the ask.
    assert.deepStrictEqual(run.completed[0], { answer: ANSWER });
    assert.isUndefined(run.registry.getRun("turn-answer-run"));

    // ── Attribution, read from the PROJECTION the client snapshot is built from ──
    // The writer prompt is a `user`-role message because that is how a provider takes turn input.
    // Without an author a client can only tell it from something the person typed by sniffing the
    // text, which is how nine paragraphs of machine instructions ended up in the user's styling.
    const query = yield* ProjectionSnapshotQuery;
    const detail = Option.getOrThrow(
      yield* query.getThreadDetailById(ThreadId.make(launchThreadId)),
    );
    const userMessages = detail.messages.filter((message) => message.role === "user");
    const prompt = userMessages.find((message) => message.text.includes("Write the description."));
    assert.isDefined(prompt);
    assert.deepStrictEqual(prompt?.t3teamExt?.author, {
      kind: "workflow",
      workflowRunId: "turn-answer-run",
      // The ask's correlationId — also the id its live step activity is keyed by.
      stepId: "turn-answer-run:1",
      label: "Write",
    });

    // The ANSWER carries the SAME attribution, which is what lets a client collapse a step's reply
    // under the step's label instead of rendering workflow output as an ordinary assistant message.
    const assistantMessages = detail.messages.filter((message) => message.role === "assistant");
    const answer = assistantMessages.find((message) => message.text === ANSWER);
    assert.isDefined(answer);
    assert.deepStrictEqual(answer?.t3teamExt?.author, prompt?.t3teamExt?.author);
    // Every message OF THE TURN is attributed — the preamble and the tool narration too, since they
    // are just as machine-authored as the answer. Turn messages are the ones carrying a turnId.
    const turnMessages = assistantMessages.filter((message) => message.turnId !== null);
    assert.strictEqual(turnMessages.length, 3);
    assert.deepStrictEqual(
      turnMessages.map((message) => message.t3teamExt?.author?.kind),
      ["workflow", "workflow", "workflow"],
    );
    // The run's COMPLETION message is assistant-role too and is deliberately NOT stamped: it is the
    // run reporting to the human, rendered as its own card (it carries the draft ref), not a step's
    // output to collapse. Attributing it would collapse the card the user is meant to click.
    const completion = assistantMessages.find((message) => message.turnId === null);
    assert.isDefined(completion);
    assert.isUndefined(completion?.t3teamExt?.author);
    // NOT hidden: observability over gates. The web collapses it; the server never suppresses it.
    assert.isUndefined(answer?.t3teamExt?.visibleToUser);
    // Attribution is an in-place update, not an extra bubble: still one message per emitted reply.
    assert.strictEqual(answer?.text, ANSWER);

    // …and an ordinary typed message carries NO author, which is what "render as human" means.
    const orchestration = yield* OrchestrationEngineService;
    yield* orchestration.dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make("turn-answer-human"),
      threadId: ThreadId.make(launchThreadId),
      message: {
        messageId: MessageId.make("turn-answer-human-msg"),
        role: "user",
        text: "thanks",
        turnId: null,
        streaming: false,
      },
      createdAt: ISO,
    });
    const afterHuman = Option.getOrThrow(
      yield* query.getThreadDetailById(ThreadId.make(launchThreadId)),
    );
    const human = afterHuman.messages.find((message) => message.text === "thanks");
    assert.isDefined(human);
    assert.isUndefined(human?.t3teamExt?.author);
  }).pipe(Effect.provide(testLayer([[[PREAMBLE], ["Reading the work item…"], [ANSWER]]]))),
);

it.live("fails the run loudly when the turn ends without a word of reply text", () =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(100));
    const launchThreadId = "turn-empty-launch";
    yield* seedProjectAndThread(launchThreadId);
    const run = yield* launch({ runId: "turn-empty-run", launchThreadId });
    assert.strictEqual(run.launched.status, "suspended");

    yield* waitUntil(
      () => run.completed.length > 0 || run.errors.length > 0,
      "the silent writer run to settle",
    );
    // Never a completion over an empty answer, and the reason says what happened.
    assert.deepStrictEqual(run.completed, []);
    assert.strictEqual(run.errors.length, 1);
    const reason = run.errors[0] instanceof Error ? run.errors[0].message : String(run.errors[0]);
    assert.include(reason, "no answer to return");
    // The launching conversation is told — a failure notice, not silence.
    assert.isTrue(
      run.dispatched.some(
        (command) =>
          command.type === "thread.message.upsert" &&
          command.message.text.toLowerCase().includes("failed"),
      ),
    );
    assert.isUndefined(run.registry.getRun("turn-empty-run"));
  }).pipe(Effect.provide(testLayer([[]]))),
);

/**
 * Replace the broker's live pending ask with what boot rehydration restores from the run row:
 * same run + correlation, NO author (hot-index only), and the journaled re-drive budget. This
 * is the observable difference between "this uptime's agent said nothing" and "the host
 * restarted mid-step" — the retry path keys on it.
 */
const simulateRehydratedPendingAsk = (
  registry: T3TeamWorkflowEngineRegistryShape,
  runId: string,
  threadId: string,
  turnRetries = 0,
) => {
  registry.setPending(threadId, {
    runId,
    correlationId: `${runId}:1`,
    kind: "thread.turn",
    turnRetries,
  });
};

/**
 * The run row as the launch lifecycle would have written it (`recordRunning` +
 * `recordSuspended`): this test's launch helper does not wire the DB lifecycle, so the row is
 * seeded by the test — the reactor's re-drive journaling (the SUT) then updates it.
 */
const seedRunRow = (runId: string, launchThreadId: string) =>
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    yield* repo.upsert({
      runId,
      workflowPath,
      args: {},
      argsHash: "test-hash",
      launchThreadId,
      projectId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      status: "suspended",
      origin: "recipe",
      recipePath: null,
      pendingThreadId: launchThreadId,
      pendingCorrelationId: `${runId}:1`,
      pendingKind: "thread.turn",
      wakeAt: null,
      createdAt: ISO,
      updatedAt: ISO,
    });
  });

it.live("re-drives an interrupted step after a host restart instead of failing the run", () =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(100));
    const launchThreadId = "turn-restart-launch";
    yield* seedProjectAndThread(launchThreadId);
    const run = yield* launch({ runId: "turn-restart-run", launchThreadId });
    assert.strictEqual(run.launched.status, "suspended");

    // The step's FIRST drive is the interrupted one (the silent script); the re-drive answers.
    yield* seedRunRow("turn-restart-run", launchThreadId);
    simulateRehydratedPendingAsk(run.registry, "turn-restart-run", launchThreadId, 0);

    yield* waitUntil(
      () => run.completed.length > 0 || run.errors.length > 0,
      "the interrupted writer run to settle",
    );
    // No failure at all: the re-driven turn's answer settled the SAME correlation and the run
    // completed — the step was re-driven in place, not the run re-run from its prefix.
    assert.deepStrictEqual(run.errors, []);
    assert.deepStrictEqual(run.completed[0], { answer: ANSWER });
    assert.isUndefined(run.registry.getRun("turn-restart-run"));

    // The re-drive journaled its attempt ON THE RUN (migration 052): a second restart seeds the
    // rehydrated pending ask with this value instead of a fresh 3-attempt budget.
    const repo = yield* WorkflowRunRepository;
    const row = Option.getOrUndefined(yield* repo.getById({ runId: "turn-restart-run" }));
    assert.strictEqual(row?.turnRetries, 1);
  }).pipe(Effect.provide(testLayer([[], [[ANSWER]]]))),
);

it.live("fails the run only after the bounded re-drive budget is exhausted", () =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(100));
    const launchThreadId = "turn-exhausted-launch";
    yield* seedProjectAndThread(launchThreadId);
    const run = yield* launch({ runId: "turn-exhausted-run", launchThreadId });
    assert.strictEqual(run.launched.status, "suspended");

    // Every drive of this step — the interrupted one and all three re-drives — ends silent.
    yield* seedRunRow("turn-exhausted-run", launchThreadId);
    simulateRehydratedPendingAsk(run.registry, "turn-exhausted-run", launchThreadId, 0);

    yield* waitUntil(
      () => run.completed.length > 0 || run.errors.length > 0,
      "the exhausted writer run to fail",
    );
    assert.deepStrictEqual(run.completed, []);
    assert.strictEqual(run.errors.length, 1);
    const reason = run.errors[0] instanceof Error ? run.errors[0].message : String(run.errors[0]);
    // The EXISTING reason text — plus the step id, so the launching conversation learns WHERE.
    assert.include(reason, "no answer to return");
    assert.include(reason, "turn-exhausted-run:1");
    assert.isUndefined(run.registry.getRun("turn-exhausted-run"));

    const repo = yield* WorkflowRunRepository;
    const row = Option.getOrUndefined(yield* repo.getById({ runId: "turn-exhausted-run" }));
    // The budget is what ran out: three journaled re-drives on the run row.
    assert.strictEqual(row?.turnRetries, 3);
  }).pipe(Effect.provide(testLayer([[], [], []]))),
);
