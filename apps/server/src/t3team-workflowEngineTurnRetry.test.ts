/**
 * The bounded re-drive, unit-level: a step whose run ended without an answer re-drives live or
 * rehydrated, the due re-drive re-posts the step's prompt as a fresh turn (or waits for a run
 * that took the step over, or consumes an answer that landed meanwhile), and when the budget is
 * spent the run fails with the PROVIDER's reason — not a generic "no reply text" (GHE #403 §1).
 */
import { assert, it } from "@effect/vitest";
import { MessageId, withT3TeamMessageExtContext } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  makeWorkflowEngineRegistry,
  type WorkflowPendingAsk,
  type WorkflowRegisteredRun,
} from "./t3team-workflowEngineRegistry.ts";
import {
  failedTurnMessage,
  makeInterruptedTurnRetry,
  MAX_INTERRUPTED_TURN_REDRIVES,
} from "./t3team-workflowEngineTurnRetry.ts";
import type { WorkflowHostStartTurnInput } from "./t3team-workflowHostPort.ts";
import {
  failingReads,
  message,
  records,
  STEP_PROMPT,
  STEP_THREAD as THREAD,
  v2Run,
} from "./t3team-workflowTurnRecords.fixtures.ts";

const RUN = "run-1";
const STEP = `${RUN}:3`;
const AUTHOR = {
  kind: "workflow" as const,
  workflowRunId: RUN,
  stepId: STEP,
  label: "Pick next task",
};

/** The step's prompt on the thread, stamped with the run + step author. */
const prompt = message({
  id: MessageId.make(STEP_PROMPT),
  runId: null,
  role: "user",
  text: "Pick the next task.",
  createdBy: "system",
  creationSource: "server",
  context: withT3TeamMessageExtContext({ author: AUTHOR })!,
});

function harness(input: {
  readonly status?: Parameters<typeof v2Run>[0];
  readonly answer?: string;
  readonly promptOnThread?: boolean;
  readonly unreadable?: boolean;
}) {
  const registry = makeWorkflowEngineRegistry();
  const failed: unknown[] = [];
  const resumed: unknown[] = [];
  const armed: Array<{ correlationId: string; delayMs: number }> = [];
  const journaled: number[] = [];
  const started: WorkflowHostStartTurnInput[] = [];
  const run: WorkflowRegisteredRun = {
    resume: async (_correlationId, reply) => void resumed.push(reply),
    cancel: () => {},
    fail: async (error) => void failed.push(error),
  };
  registry.registerRun(RUN, run);
  const threads = input.unreadable
    ? failingReads("read")
    : records({
        run: v2Run(input.status ?? "failed"),
        messages: [
          ...(input.promptOnThread === false ? [] : [prompt]),
          ...(input.answer === undefined
            ? []
            : [message({ role: "assistant", text: input.answer })]),
        ],
      });
  const retry = makeInterruptedTurnRetry({
    registry,
    threads,
    startTurn: (turn) => Effect.sync(() => void started.push(turn)),
    recordTurnRetries: (_runId, turnRetries) => Effect.sync(() => void journaled.push(turnRetries)),
    armTurnRetry: (_threadId, correlationId, delayMs) =>
      Effect.sync(() => void armed.push({ correlationId, delayMs })),
    backoffOverrideMs: 1,
  });
  return { registry, run, failed, resumed, armed, journaled, started, retry };
}

const liveAsk: WorkflowPendingAsk = { runId: RUN, correlationId: STEP, kind: "thread.turn" };

it.effect("settleFailedTurn re-drives a LIVE ask whose turn failed, with a fresh budget", () =>
  Effect.gen(function* () {
    const h = harness({});
    yield* h.retry.settleFailedTurn(THREAD, liveAsk, h.run, "Request timed out");
    assert.deepStrictEqual(h.failed, []);
    assert.deepStrictEqual(h.armed, [{ correlationId: STEP, delayMs: 1 }]);
    assert.deepStrictEqual(h.journaled, [1]);
    const pending = h.registry.peekPending(THREAD);
    assert.strictEqual(pending?.correlationId, STEP);
    assert.strictEqual(pending?.turnRetries, 1);
    // Checks before the re-drive posts its prompt must not judge the dead run again.
    assert.strictEqual(pending?.redriveScheduled, true);
  }),
);

it.effect(
  "settleFailedTurn fails the run with the provider's reason once the budget is spent",
  () =>
    Effect.gen(function* () {
      const h = harness({});
      yield* h.retry.settleFailedTurn(
        THREAD,
        { ...liveAsk, turnRetries: MAX_INTERRUPTED_TURN_REDRIVES },
        h.run,
        "Request timed out",
      );
      assert.deepStrictEqual(h.armed, []);
      const reason = (h.failed[0] as Error).message;
      assert.include(reason, failedTurnMessage("Request timed out"));
      assert.include(reason, STEP);
      assert.include(reason, `${MAX_INTERRUPTED_TURN_REDRIVES} re-drives exhausted`);
      assert.isUndefined(h.registry.peekPending(THREAD));
    }),
);

it.effect("processTurnRetry re-posts the SAME prompt as a fresh queued turn", () =>
  Effect.gen(function* () {
    const h = harness({});
    h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 1, redriveScheduled: true });
    yield* h.retry.processTurnRetry({ threadId: THREAD, correlationId: STEP });
    assert.strictEqual(h.started.length, 1);
    const turn = h.started[0]!;
    assert.strictEqual(turn.threadId, THREAD);
    assert.strictEqual(turn.text, "Pick the next task.");
    assert.deepStrictEqual(turn.author, AUTHOR);
    assert.notStrictEqual(turn.messageId, STEP_PROMPT);
    // The ask now waits on the NEW prompt's run.
    const pending = h.registry.peekPending(THREAD);
    assert.strictEqual(pending?.promptMessageId, turn.messageId);
    assert.isUndefined(pending?.redriveScheduled);
    assert.deepStrictEqual(h.failed, []);
  }),
);

it.effect("processTurnRetry waits when a run already owns the step again", () =>
  Effect.gen(function* () {
    const h = harness({ status: "running" });
    h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 1, promptMessageId: STEP_PROMPT });
    yield* h.retry.processTurnRetry({ threadId: THREAD, correlationId: STEP });
    assert.deepStrictEqual(h.started, []);
    assert.deepStrictEqual(h.failed, []);
    assert.strictEqual(h.registry.peekPending(THREAD)?.correlationId, STEP);
  }),
);

it.effect("processTurnRetry consumes an answer that landed while it waited", () =>
  Effect.gen(function* () {
    const h = harness({ status: "completed", answer: "Task 7." });
    h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 1, promptMessageId: STEP_PROMPT });
    yield* h.retry.processTurnRetry({ threadId: THREAD, correlationId: STEP });
    assert.deepStrictEqual(h.started, []);
    assert.deepStrictEqual(h.resumed, ["Task 7."]);
    assert.isUndefined(h.registry.peekPending(THREAD));
  }),
);

it.effect("processTurnRetry fails the run instead of parking it when the prompt is gone", () =>
  Effect.gen(function* () {
    const h = harness({ promptOnThread: false });
    h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 1 });
    yield* h.retry.processTurnRetry({ threadId: THREAD, correlationId: STEP });
    assert.deepStrictEqual(h.started, []);
    assert.match((h.failed[0] as Error).message, /can no longer be re-driven/);
  }),
);

it.effect("processTurnRetry re-arms without spending budget when the thread cannot be read", () =>
  Effect.gen(function* () {
    const h = harness({ unreadable: true });
    h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 1, redriveScheduled: true });
    yield* h.retry.processTurnRetry({ threadId: THREAD, correlationId: STEP });
    assert.deepStrictEqual(h.started, []);
    assert.deepStrictEqual(h.failed, []);
    assert.deepStrictEqual(h.armed, [{ correlationId: STEP, delayMs: 1 }]);
    assert.deepStrictEqual(h.journaled, []);
    const pending = h.registry.peekPending(THREAD);
    assert.strictEqual(pending?.turnRetries, 1);
    assert.strictEqual(pending?.redriveScheduled, true);
  }),
);
