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
import { OrchestrationEngineLive } from "./orchestration/Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./orchestration/Layers/ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./orchestration/Layers/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
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
  new URL("../__fixtures__/t3team-writerTurn.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-turn-answer-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const projectId = ProjectId.make("proj-turn-answer");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-07-28T00:00:00.000Z";

const PREAMBLE =
  "Ich hole erst den Kontext zum Item: Parent, Kinder, Kommentare, Links. Dann schreibe ich nur die neue Beschreibung.";
const ANSWER = "## Goal\nCheckout must round to two decimals.";

/** A stub provider whose turn emits the given assistant messages, with a tool activity between. */
const StubProviderLive = (messages: ReadonlyArray<ReadonlyArray<string>>) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const orchestration = yield* OrchestrationEngineService;
      yield* Effect.forkScoped(
        Stream.runForEach(orchestration.streamDomainEvents, (event) => {
          if (event.type !== "thread.turn-start-requested") return Effect.void;
          const { threadId, messageId: turnMessageId } = event.payload;
          const idPrefix = `stub:${turnMessageId}`;
          const commands = stubAgentTurnCommands({ threadId, idPrefix, messages, createdAt: ISO });
          // A tool call in the middle of the turn: the reactor must not read it as an answer, and
          // must not settle the ask while the turn keeps working.
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
          const insertAt = Math.min(3, commands.length - 1);
          const script = [
            ...commands.slice(0, insertAt),
            toolActivity,
            ...commands.slice(insertAt),
          ];
          return Effect.forEach(script, (command) => orchestration.dispatch(command), {
            concurrency: 1,
            discard: true,
          }).pipe(Effect.orDie);
        }),
      );
    }),
  );

const EngineLive = OrchestrationEngineLive.pipe(
  // `provideMerge` (not `provide`): the test body reads the PROJECTED thread detail — the same
  // source the client snapshot is built from — to assert what a client can actually see.
  Layer.provideMerge(OrchestrationProjectionSnapshotQueryLive),
  Layer.provide(OrchestrationProjectionPipelineLive),
  Layer.provide(OrchestrationEventStoreLive),
  Layer.provide(OrchestrationCommandReceiptRepositoryLive),
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-turn-answer-" })),
  Layer.provideMerge(NodeServices.layer),
);

const testLayer = (messages: ReadonlyArray<ReadonlyArray<string>>) =>
  Layer.mergeAll(T3TeamWorkflowEngineReactorLive, StubProviderLive(messages)).pipe(
    Layer.provideMerge(Layer.merge(EngineLive, T3TeamWorkflowEngineRegistryLive)),
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
  }).pipe(Effect.provide(testLayer([[PREAMBLE], ["Reading the work item…"], [ANSWER]]))),
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
  }).pipe(Effect.provide(testLayer([]))),
);
