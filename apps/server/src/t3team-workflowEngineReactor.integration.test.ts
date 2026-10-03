// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * Real-path proof for the workflow-engine resume reactor on orchestration V2.
 *
 * Nothing here plays the reactor's role by hand: the run is launched through the REAL launch
 * funnel and workflow host on a real V2 orchestrator (`t3team-workflowStubRuntime.ts`), a
 * scripted pack provider answers each agent turn through the real provider seam, and the run
 * advances SOLELY because the production reactor sees the step's run end (`run.updated`) or a
 * person's message land (`message.updated`).
 *
 *   1. launch → `agent()` spawns a child thread (linked under the launch thread) and queues the
 *      step's prompt there → suspends.
 *   2. the child's run completes with the reply → the reactor reads the answer → resumes.
 *   3. the run reaches `thread.askUser` → posts the question → suspends on `user.input`.
 *   4. a person types the answer on the launch thread → the reactor resolves it → completes.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { readT3TeamMessageExtContext, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { isTerminalRunStatus } from "./orchestration-v2/ThreadManagementService.ts";
import * as EventSink from "./orchestration-v2/EventSink.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import {
  launchScenarioWorkflow,
  setUpLaunchThread,
  threadMessages,
  typeUserMessage,
  waitUntil,
} from "./t3team-workflowEngineScenario.fixtures.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeWorkflowStubRuntime } from "./t3team-workflowStubRuntime.ts";

const fixture = (name: string) =>
  NodeURL.fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url));
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-reactor-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

/** Workflow prompts get `reply`; a turn a person's own message started gets an acknowledgement. */
const answering = (reply: string) =>
  makeWorkflowStubRuntime({
    name: "t3team-workflow-reactor",
    respond: (turn) => (turn.message.createdBy === "user" ? "Noted." : reply),
  });

const REVIEW = '{"summary":"Low risk; well tested."}';

it.live("drives agent() and askUser END TO END off V2 run and message events", () => {
  const runtime = answering(REVIEW);
  return Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const facts = yield* T3TeamThreadFactsStore;
    const threads = yield* ThreadManagementService;
    const { projectId, launchThreadId } = yield* setUpLaunchThread("reactor-e2e");
    const run = yield* launchScenarioWorkflow({
      runId: "reactor-run",
      workflowPath: fixture("t3team-exampleReview.workflow.ts"),
      launchThreadId,
      projectId,
      runsRoot,
      args: { prTitle: "Fix the billing rounding bug" },
    });
    assert.strictEqual(run.launched.status, "suspended");

    // The child's run ended with the review → the reactor resumed → the run parked on askUser.
    yield* waitUntil(
      () => registry.peekPending(launchThreadId)?.kind === "user.input",
      "the run to advance past agent() and park on askUser",
    );
    assert.strictEqual(runtime.turns.length, 1);
    const childThreadId = runtime.turns[0]!.threadId;
    assert.include(runtime.turns[0]!.message.text, "Fix the billing rounding bug");
    // The one-shot child is linked under the launch thread, and marked ephemeral.
    const child = yield* threads.getThreadShell(ThreadId.make(childThreadId));
    assert.strictEqual(child?.lineage.parentThreadId, launchThreadId);
    assert.strictEqual(child?.lineage.relationshipToParent, "subagent");
    assert.strictEqual((yield* facts.get(ThreadId.make(childThreadId)))?.retention, "ephemeral");

    // The question is on the launch thread, tagged as awaiting the user's answer.
    const question = (yield* threadMessages(launchThreadId)).find((message) =>
      message.text.startsWith('Merge "Fix the billing rounding bug"?'),
    );
    assert.strictEqual(readT3TeamMessageExtContext(question?.context)?.status, "waiting-for-input");
    assert.strictEqual(run.completed.length, 0);

    // A person answers in the composer. Nothing here resolves the ask by hand.
    yield* typeUserMessage(launchThreadId, '{"merge":true}', "merge");
    yield* waitUntil(() => run.completed.length > 0, "the run to complete after the reply");
    assert.deepStrictEqual(run.completed[0], { summary: "Low risk; well tested.", merged: true });
    assert.deepStrictEqual(run.errors, []);
    assert.isUndefined(registry.getRun("reactor-run"));

    // The completion is held while the reply's own turn runs, then posted after it.
    yield* waitUntil(
      () =>
        threadMessages(launchThreadId).pipe(
          Effect.map((messages) => messages.some((m) => m.id === "t3team-wf-result:reactor-run")),
        ),
      "the completion message to post once the launch thread is idle",
    );

    // A later message from the person cannot settle the consumed ask again.
    yield* typeUserMessage(launchThreadId, '{"merge":false}', "late");
    yield* waitUntil(() => runtime.turns.length >= 3, "the late message's own turn");
    assert.strictEqual(run.completed.length, 1);
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});

it.live("settles all parallel live agent replies while the parent replay is in progress", () => {
  const runtime = answering('{"summary":"seed"}');
  return Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const { projectId, launchThreadId } = yield* setUpLaunchThread("reactor-parallel");
    const run = yield* launchScenarioWorkflow({
      runId: "reactor-parallel-run",
      workflowPath: fixture("t3team-parallelAgentsAfterResume.workflow.ts"),
      launchThreadId,
      projectId,
      runsRoot,
    });
    assert.strictEqual(run.launched.status, "suspended");
    yield* waitUntil(
      () => run.completed.length + run.errors.length > 0,
      "parallel live children to settle",
    );
    assert.deepStrictEqual(run.errors, []);
    assert.deepStrictEqual(run.completed[0], { count: 3 });
    assert.strictEqual(runtime.turns.length, 4);
    const notice = (yield* threadMessages(launchThreadId)).find(
      (message) => message.text === "Parallel children complete",
    );
    assert.strictEqual(notice?.role, "system");
    assert.isUndefined(registry.getRun("reactor-parallel-run"));
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});

it.live("commits the step run's terminal run.updated after its last assistant message", () => {
  const runtime = makeWorkflowStubRuntime({
    name: "t3team-workflow-reactor-order",
    respond: () => ["Reading the item first…", "The final answer."],
  });
  return Effect.gen(function* () {
    const sink = yield* EventSink.EventSinkV2;
    const { projectId, launchThreadId } = yield* setUpLaunchThread("reactor-order");
    const run = yield* launchScenarioWorkflow({
      runId: "reactor-order-run",
      workflowPath: fixture("t3team-writerTurn.workflow.ts"),
      launchThreadId,
      projectId,
      runsRoot,
    });
    yield* waitUntil(() => run.completed.length + run.errors.length > 0, "the writer to settle");
    assert.deepStrictEqual(run.completed[0], { answer: "The final answer." });

    // The step's run: every assistant message it wrote was committed BEFORE its terminal
    // run.updated — the reactor's read at that event sees the whole turn.
    const stored = yield* sink
      .stream({ threadId: ThreadId.make(launchThreadId), afterSequence: 0 })
      .pipe(
        Stream.takeUntil(
          ({ event }) => event.type === "run.updated" && isTerminalRunStatus(event.payload.status),
        ),
        Stream.runCollect,
      );
    const events = [...stored];
    const terminal = events.at(-1)!;
    assert.strictEqual(terminal.event.type, "run.updated");
    const runId = terminal.event.type === "run.updated" ? terminal.event.payload.id : null;
    const answers = events.filter(
      ({ event }) =>
        event.type === "message.updated" &&
        event.payload.role === "assistant" &&
        event.payload.runId === runId,
    );
    assert.strictEqual(answers.length, 2);
    for (const answer of answers) assert.isBelow(answer.sequence, terminal.sequence);
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});
