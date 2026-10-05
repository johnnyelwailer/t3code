/**
 * The reactor's settle rules, driven through the production task handler with the REAL registry,
 * scripted V2 thread records, and a recording stand-in for the re-drive:
 *   • a step settles only when the run its prompt started has ENDED, with that run's answer;
 *   • a run that ended without completing re-drives a durable ask (live or rehydrated) with the
 *     provider's error; a live composition ask settles with "" so its own check fires;
 *   • a silent completed run fails a live durable ask outright, re-drives a rehydrated one;
 *   • an `askUser` settles on a PERSON's message — not a widget action, not a reply pinned to
 *     another ask, not server-written text.
 */
import { assert, it } from "@effect/vitest";
import { MessageId, withT3TeamMessageExtContext } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { createWorkflowReactorTaskHandler } from "./t3team-workflowEngineReactorTasks.ts";
import {
  makeWorkflowEngineRegistry,
  type WorkflowPendingAsk,
  type WorkflowRegisteredRun,
} from "./t3team-workflowEngineRegistry.ts";
import { type InterruptedTurnRetry, NO_TEXT_MESSAGE } from "./t3team-workflowEngineTurnRetry.ts";
import { PROMPT_LOST_ERROR } from "./t3team-workflowEngineTurnRetrySupport.ts";
import type { WorkflowTurnReads } from "./t3team-workflowTurnState.ts";
import {
  failingReads,
  failureItem,
  message,
  records,
  STEP_THREAD as THREAD,
  STEP_PROMPT as PROMPT,
  AT,
  v2Run,
} from "./t3team-workflowTurnRecords.fixtures.ts";

const RUN = "run-1";
const STEP = `${RUN}:2`;
const setup = (
  pending: Omit<WorkflowPendingAsk, "runId" | "correlationId" | "kind">,
  threads: WorkflowTurnReads,
  releasable = true,
) => {
  const registry = makeWorkflowEngineRegistry();
  const calls: string[] = [];
  const run: WorkflowRegisteredRun = {
    resume: async (_correlationId, reply) => void calls.push(`resume:${JSON.stringify(reply)}`),
    cancel: () => {},
    fail: async (error) =>
      void calls.push(`fail:${error instanceof Error ? error.message : error}`),
  };
  registry.registerRun(RUN, run);
  registry.setPending(THREAD, { runId: RUN, correlationId: STEP, kind: "thread.turn", ...pending });
  const turnRetry: InterruptedTurnRetry = {
    releaseHeldRun: (_threadId, runId) =>
      Effect.sync(() => {
        calls.push(`release:${runId}`);
        return releasable;
      }),
    settleFailedTurn: (_threadId, _pending, _run, error) =>
      Effect.sync(() => void calls.push(`redrive-failed:${error}`)),
    settleNoText: () => Effect.sync(() => void calls.push("redrive-silent")),
    processTurnRetry: () => Effect.void,
  };
  const attributed: string[] = [];
  const handle = createWorkflowReactorTaskHandler({
    registry,
    threads,
    turnRetry,
    attributeAnswer: ({ messageId }) => Effect.sync(() => void attributed.push(messageId)),
  });
  return { registry, calls, attributed, handle };
};

it.effect("waits while the step's run is still running", () =>
  Effect.gen(function* () {
    const { handle, calls, registry } = setup(
      { promptMessageId: PROMPT },
      records({ run: v2Run("running") }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, []);
    assert.isDefined(registry.peekPending(THREAD));
  }),
);

it.effect("settles with the ended run's final answer and attributes it", () =>
  Effect.gen(function* () {
    const done = { ...v2Run("completed"), completedAt: AT };
    const { handle, calls, attributed, registry } = setup(
      {
        promptMessageId: PROMPT,
        author: { kind: "workflow", workflowRunId: RUN, stepId: STEP, label: "Write" },
      },
      records({ run: done, messages: [message({ role: "assistant", text: "The answer." })] }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, ['resume:"The answer."']);
    assert.deepStrictEqual(attributed, ["m-The answer."]);
    assert.isUndefined(registry.peekPending(THREAD));
  }),
);

it.effect("re-drives a live durable ask with the provider's error when its run failed", () =>
  Effect.gen(function* () {
    const { handle, calls } = setup(
      { promptMessageId: PROMPT },
      records({ run: v2Run("failed"), turnItems: [failureItem("Gateway Timeout")] }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, ["redrive-failed:Gateway Timeout"]);
  }),
);

it.effect("re-drives a step whose run was interrupted before it completed", () =>
  Effect.gen(function* () {
    const { handle, calls } = setup(
      { promptMessageId: PROMPT },
      records({ run: v2Run("interrupted") }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.strictEqual(calls.length, 1);
    assert.include(calls[0], "redrive-failed:The agent turn ended before it completed");
  }),
);

it.effect("settles a live composition ask with an empty reply so its own check fires", () =>
  Effect.gen(function* () {
    const live: unknown[] = [];
    const { handle, calls } = setup(
      { promptMessageId: PROMPT, resolveLive: async (reply) => void live.push(reply) },
      records({ run: v2Run("failed") }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(live, [""]);
    assert.deepStrictEqual(calls, []);
  }),
);

it.effect("fails the run outright when a live step's run completes silent", () =>
  Effect.gen(function* () {
    const { handle, calls } = setup(
      { promptMessageId: PROMPT },
      records({ run: v2Run("completed") }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, [`fail:${NO_TEXT_MESSAGE}`]);
  }),
);

it.effect("re-drives a rehydrated ask that ended silent, finding its prompt by author stamp", () =>
  Effect.gen(function* () {
    const prompt = message({
      id: MessageId.make(PROMPT),
      runId: null,
      role: "user",
      text: "Write it.",
      createdBy: "system",
      creationSource: "server",
      context: withT3TeamMessageExtContext({
        author: { kind: "workflow", workflowRunId: RUN, stepId: STEP, label: "Write" },
      })!,
    });
    const { handle, calls } = setup(
      { turnRetries: 0 },
      records({ run: v2Run("completed"), messages: [prompt] }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, ["redrive-silent"]);
  }),
);

it.effect("skips a step whose re-drive is already scheduled", () =>
  Effect.gen(function* () {
    const { handle, calls } = setup(
      { promptMessageId: PROMPT, redriveScheduled: true },
      records({ run: v2Run("failed") }),
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, []);
  }),
);

it.effect("takes a step run held in a paused queue out of it, then re-drives the step", () =>
  Effect.gen(function* () {
    const held = { ...v2Run("queued"), queueHeld: true };
    const { handle, calls } = setup({ promptMessageId: PROMPT }, records({ run: held }));
    yield* handle({ kind: "check", threadId: THREAD });
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0], `release:${held.id}`);
    assert.include(calls[1], "redrive-failed:The agent turn never started");
  }),
);

it.effect("looks again later when the held run already left the queue", () =>
  Effect.gen(function* () {
    const held = { ...v2Run("queued"), queueHeld: true };
    const { handle, calls, registry } = setup(
      { promptMessageId: PROMPT },
      records({ run: held }),
      false,
    );
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, [`release:${held.id}`]);
    assert.strictEqual(registry.peekPending(THREAD)?.correlationId, STEP);
  }),
);

it.effect("keeps a step parked when its thread cannot be read this time", () =>
  Effect.gen(function* () {
    const { handle, calls, registry } = setup({ promptMessageId: PROMPT }, failingReads("read"));
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, []);
    assert.strictEqual(registry.peekPending(THREAD)?.correlationId, STEP);
  }),
);

it.effect("fails the run when the step's thread is gone", () =>
  Effect.gen(function* () {
    const { handle, calls, registry } = setup({ promptMessageId: PROMPT }, failingReads("gone"));
    yield* handle({ kind: "check", threadId: THREAD });
    assert.deepStrictEqual(calls, [`fail:${PROMPT_LOST_ERROR}`]);
    assert.isUndefined(registry.peekPending(THREAD));
  }),
);

const userInput = () => {
  const ctx = setup({}, records({}));
  ctx.registry.setPending(THREAD, { runId: RUN, correlationId: STEP, kind: "user.input" });
  return ctx;
};

it.effect("an askUser settles on the next message a person posts", () =>
  Effect.gen(function* () {
    const { handle, calls, registry } = userInput();
    const reply = message({
      role: "user",
      text: '{"merge":true}',
      createdBy: "user",
      creationSource: "web",
    });
    yield* handle({ kind: "user-message", threadId: THREAD, message: reply });
    assert.deepStrictEqual(calls, ['resume:"{\\"merge\\":true}"']);
    assert.isUndefined(registry.peekPending(THREAD));
  }),
);

it.effect("a widget action, server text, or a reply pinned to another ask never answers", () =>
  Effect.gen(function* () {
    const { handle, calls, registry } = userInput();
    const person = {
      role: "user" as const,
      createdBy: "user" as const,
      creationSource: "web" as const,
    };
    yield* handle({
      kind: "user-message",
      threadId: THREAD,
      message: message({
        ...person,
        text: "Approve",
        context: withT3TeamMessageExtContext({
          widgetReply: { widgetId: "w", widgetTitle: "Release" },
        })!,
      }),
    });
    yield* handle({
      kind: "user-message",
      threadId: THREAD,
      message: message({
        role: "user",
        text: "framing",
        createdBy: "system",
        creationSource: "server",
      }),
    });
    yield* handle({
      kind: "user-message",
      threadId: THREAD,
      message: message({
        ...person,
        text: "old",
        context: withT3TeamMessageExtContext({
          workflowReply: { value: true, correlationId: `${RUN}:1` },
        })!,
      }),
    });
    assert.deepStrictEqual(calls, []);
    assert.strictEqual(registry.peekPending(THREAD)?.kind, "user.input");

    yield* handle({
      kind: "user-message",
      threadId: THREAD,
      message: message({
        ...person,
        text: "Approve",
        context: withT3TeamMessageExtContext({
          workflowReply: { value: "approve", correlationId: STEP },
        })!,
      }),
    });
    assert.deepStrictEqual(calls, ['resume:"approve"']);
  }),
);
