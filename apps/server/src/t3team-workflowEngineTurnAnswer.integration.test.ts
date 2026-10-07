// @effect-diagnostics nodeBuiltinImport:off - integration test reads a workflow fixture + temp dir.
/**
 * Which text an `askAgent` step resolves with, and what happens when its turn never answers —
 * on a real orchestration V2 runtime with a scripted agent (`t3team-workflowStubRuntime.ts`).
 *
 * The step settles when the run its prompt started ends; the answer is that run's LAST
 * substantive assistant message (never a preamble the turn opened with). A turn that ends
 * without completing (failed, interrupted) or a rehydrated step whose turn ends silent is
 * re-driven as a fresh queued turn, up to the bounded budget journaled on the run row; a live
 * step whose turn completes silent fails the run loudly.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import type { PackTurnInput } from "@t3team/pack-api";
import { assert, it } from "@effect/vitest";
import { afterAll } from "vite-plus/test";
import { type ProjectId, readT3TeamMessageExtContext } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { T3TeamThreadArtifactsStore } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import {
  launchScenarioWorkflow,
  SCENARIO_ISO,
  setUpLaunchThread,
  threadMessages,
  waitUntil,
} from "./t3team-workflowEngineScenario.fixtures.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import {
  WORKFLOW_STUB_MODEL_SELECTION,
  type WorkflowStubReply,
} from "./t3team-workflowStubAgentTurn.ts";
import { makeWorkflowStubRuntime } from "./t3team-workflowStubRuntime.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-writerTurn.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-turn-answer-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

// Shorten the re-drive backoff (the e2e override knob) so the re-drive paths run in milliseconds.
process.env.T3TEAM_INTERRUPTED_TURN_RETRY_BACKOFF_MS = "25";

const PREAMBLE = "I'll fetch the item's context first: parent, children, comments, links.";
const ANSWER = "## Goal\nCheckout must round to two decimals.";

/** The Nth turn gets the Nth reply (the last one repeats). */
const scripted = (name: string, replies: ReadonlyArray<WorkflowStubReply>) =>
  makeWorkflowStubRuntime({
    name,
    respond: (_turn, index) => replies[Math.min(index, replies.length - 1)]!,
  });

/** The run row the launch lifecycle would have written; the re-drive journals onto it. */
const seedRunRow = (runId: string, launchThreadId: string, projectId: ProjectId) =>
  Effect.flatMap(WorkflowRunRepository, (repo) =>
    repo.upsert({
      runId,
      workflowPath,
      args: {},
      argsHash: "test-hash",
      launchThreadId,
      projectId,
      modelSelection: WORKFLOW_STUB_MODEL_SELECTION,
      runtimeMode: "full-access",
      interactionMode: "default",
      status: "suspended",
      origin: "recipe",
      recipePath: null,
      pendingThreadId: launchThreadId,
      pendingCorrelationId: `${runId}:1`,
      pendingKind: "thread.turn",
      wakeAt: null,
      createdAt: SCENARIO_ISO,
      updatedAt: SCENARIO_ISO,
    }),
  );

const turnRetriesOf = (runId: string) =>
  Effect.flatMap(WorkflowRunRepository, (repo) => repo.getById({ runId })).pipe(
    Effect.map((row) => Option.getOrUndefined(row)?.turnRetries),
  );

const launchWriter = (name: string) =>
  Effect.gen(function* () {
    const { projectId, launchThreadId } = yield* setUpLaunchThread(name);
    yield* seedRunRow(`${name}-run`, launchThreadId, projectId);
    const run = yield* launchScenarioWorkflow({
      runId: `${name}-run`,
      workflowPath,
      launchThreadId,
      projectId,
      runsRoot,
    });
    assert.strictEqual(run.launched.status, "suspended");
    yield* waitUntil(() => run.completed.length + run.errors.length > 0, `${name} to settle`);
    return { ...run, launchThreadId, runId: `${name}-run` };
  });

it.live("resolves askAgent with the turn's FINAL answer, not the preamble it opened with", () => {
  const runtime = scripted("turn-answer", [[PREAMBLE, "Reading the work item…", ANSWER]]);
  return Effect.gen(function* () {
    const run = yield* launchWriter("turn-answer");
    assert.deepStrictEqual(run.errors, []);
    assert.deepStrictEqual(run.completed[0], { answer: ANSWER });

    // The prompt carries the step's workflow author, so a client tells it from a person's text.
    const messages = yield* threadMessages(run.launchThreadId);
    const prompt = messages.find((message) => message.text.includes("Write the description."));
    const author = readT3TeamMessageExtContext(prompt?.context)?.author;
    assert.deepStrictEqual(author, {
      kind: "workflow",
      workflowRunId: "turn-answer-run",
      stepId: "turn-answer-run:1",
      label: "Write",
    });
    assert.strictEqual(prompt?.createdBy, "system");
    // The ANSWER is attributed to the same step (its message-ext artifact), and never hidden.
    const answer = messages.find((message) => message.text === ANSWER);
    const artifacts = yield* T3TeamThreadArtifactsStore;
    const stamp = yield* artifacts.get(`message-ext:${answer?.id}`);
    assert.deepStrictEqual(stamp?.payload, { author });
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});

it.live("fails the run loudly when a live step's turn completes without a word", () => {
  const runtime = scripted("turn-empty", [{ silent: true }]);
  return Effect.gen(function* () {
    const run = yield* launchWriter("turn-empty");
    assert.deepStrictEqual(run.completed, []);
    const reason = String((run.errors[0] as Error | undefined)?.message);
    assert.include(reason, "no answer to return");
    // The launching conversation is told — a failure notice, not silence.
    yield* waitUntil(
      () =>
        threadMessages(run.launchThreadId).pipe(
          Effect.map((messages) =>
            messages.some((m) => m.text.toLowerCase().includes("orchestration stopped")),
          ),
        ),
      "the failure notice",
    );
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});

it.live("re-drives a step whose turn fails mid-stream, never settling on its preamble", () => {
  const runtime = scripted("turn-dead", [
    { fail: "gateway timeout", preamble: [PREAMBLE] },
    ANSWER,
  ]);
  return Effect.gen(function* () {
    const run = yield* launchWriter("turn-dead");
    assert.deepStrictEqual(run.errors, []);
    assert.deepStrictEqual(run.completed, [{ answer: ANSWER }]);
    // The re-drive re-posted the SAME prompt as a fresh turn and journaled one attempt.
    assert.strictEqual(runtime.turns.length, 2);
    assert.strictEqual(runtime.turns[1]!.message.text, runtime.turns[0]!.message.text);
    assert.strictEqual(yield* turnRetriesOf(run.runId), 1);
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});

it.live("re-drives a step whose turn is interrupted before it completes", () => {
  const runtime = scripted("turn-abort", [{ interrupted: true, preamble: [PREAMBLE] }, ANSWER]);
  return Effect.gen(function* () {
    const run = yield* launchWriter("turn-abort");
    assert.deepStrictEqual(run.errors, []);
    assert.deepStrictEqual(run.completed, [{ answer: ANSWER }]);
    assert.strictEqual(yield* turnRetriesOf(run.runId), 1);
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});

it.live("fails the run with the provider's reason once the re-drive budget is spent", () => {
  const runtime = scripted("turn-exhausted", [{ fail: "upstream unavailable" }]);
  return Effect.gen(function* () {
    const run = yield* launchWriter("turn-exhausted");
    assert.deepStrictEqual(run.completed, []);
    const reason = String((run.errors[0] as Error | undefined)?.message);
    assert.include(reason, "upstream unavailable");
    assert.include(reason, "turn-exhausted-run:1");
    assert.strictEqual(runtime.turns.length, 4);
    assert.strictEqual(yield* turnRetriesOf(run.runId), 3);
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});

it.live("a restored step finds its prompt again and re-drives a silent turn", () => {
  const runtime = scripted("turn-restart", [{ hold: true }, ANSWER]);
  return Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const { projectId, launchThreadId } = yield* setUpLaunchThread("turn-restart");
    yield* seedRunRow("turn-restart-run", launchThreadId, projectId);
    const run = yield* launchScenarioWorkflow({
      runId: "turn-restart-run",
      workflowPath,
      launchThreadId,
      projectId,
      runsRoot,
    });
    yield* waitUntil(() => runtime.turns.length === 1, "the first turn to start");
    // What boot rehydration restores: same run + correlation, the journaled budget, NO prompt id
    // (hot-index only) — the reactor must find the prompt by its author stamp.
    registry.setPending(launchThreadId, {
      runId: "turn-restart-run",
      correlationId: "turn-restart-run:1",
      kind: "thread.turn",
      turnRetries: 0,
    });
    runtime.settle(runtime.turns[0] as PackTurnInput, { silent: true });
    yield* waitUntil(() => run.completed.length + run.errors.length > 0, "the restored step");
    assert.deepStrictEqual(run.errors, []);
    assert.deepStrictEqual(run.completed, [{ answer: ANSWER }]);
    assert.strictEqual(yield* turnRetriesOf("turn-restart-run"), 1);
    // The re-drive posted the found prompt again: two prompts, same text.
    const prompts = (yield* threadMessages(launchThreadId)).filter(
      (message) => message.role === "user" && message.createdBy === "system",
    );
    assert.deepStrictEqual(
      prompts.map((prompt) => prompt.text),
      [runtime.turns[0]!.message.text, runtime.turns[0]!.message.text],
    );
  }).pipe(Effect.scoped, Effect.provide(runtime.layer));
});
