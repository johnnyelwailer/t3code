/**
 * The bounded re-drive, unit-level: a FAILED agent turn (the session died with `error`) re-drives
 * the step live or rehydrated, and when the budget is spent the run fails with the PROVIDER's
 * reason — not a generic "no reply text" (GHE #403 §1).
 */
import { assert, it } from "@effect/vitest";
import type { OrchestrationCommand, OrchestrationThread } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  makeWorkflowEngineRegistry,
  type WorkflowPendingAsk,
  type WorkflowRegisteredRun,
} from "./t3team-workflowEngineRegistry.ts";
import {
  failedTurnMessage,
  makeInterruptedTurnRetry,
  MAX_INTERRUPTED_TURN_REDRIVES,
  type InterruptedTurnRetryDeps,
} from "./t3team-workflowEngineTurnRetry.ts";

const THREAD = "child-thread";
const RUN = "run-1";
const STEP = `${RUN}:3`;

/** A thread whose last user message is the step's prompt, stamped with the run + step author. */
function threadWithPrompt(): OrchestrationThread {
  return {
    id: THREAD,
    session: { status: "error", activeTurnId: null },
    messages: [
      {
        id: "prompt-1",
        role: "user",
        t3teamExt: {
          author: { kind: "workflow", workflowRunId: RUN, stepId: STEP, label: "Pick next task" },
        },
      },
    ],
  } as unknown as OrchestrationThread;
}

function harness(input: { readonly thread?: OrchestrationThread | undefined }) {
  const registry = makeWorkflowEngineRegistry();
  const failed: unknown[] = [];
  const armed: Array<{ correlationId: string; delayMs: number }> = [];
  const journaled: number[] = [];
  const dispatched: OrchestrationCommand[] = [];
  const run: WorkflowRegisteredRun = {
    resume: () => Promise.resolve(),
    cancel: () => {},
    fail: (error) => {
      failed.push(error);
      return Promise.resolve();
    },
  };
  registry.registerRun(RUN, run);
  const deps: InterruptedTurnRetryDeps = {
    registry,
    readThread: () =>
      Effect.succeed(input.thread === undefined ? Option.none() : Option.some(input.thread)),
    recordTurnRetries: (_runId, turnRetries) => {
      journaled.push(turnRetries);
      return Effect.void;
    },
    armTurnRetry: (_threadId, correlationId, delayMs) => {
      armed.push({ correlationId, delayMs });
      return Effect.void;
    },
    dispatch: (command) => {
      dispatched.push(command);
      return Effect.succeed({ sequence: dispatched.length });
    },
    backoffOverrideMs: 1,
  };
  return {
    registry,
    run,
    failed,
    armed,
    journaled,
    dispatched,
    retry: makeInterruptedTurnRetry(deps),
  };
}

const liveAsk: WorkflowPendingAsk = { runId: RUN, correlationId: STEP, kind: "thread.turn" };

it.effect("settleFailedTurn re-drives a LIVE ask whose turn failed, with a fresh budget", () =>
  Effect.gen(function* () {
    const h = harness({ thread: threadWithPrompt() });
    // A live ask (set by the broker this uptime) has no `turnRetries` — unlike the silent-turn
    // path, a failed turn still re-drives it.
    yield* h.retry.settleFailedTurn(THREAD, liveAsk, h.run, "Request timed out");

    assert.deepStrictEqual(h.failed, []);
    assert.deepStrictEqual(h.armed, [{ correlationId: STEP, delayMs: 1 }]);
    assert.deepStrictEqual(h.journaled, [1]);
    const pending = h.registry.peekPending(THREAD);
    assert.strictEqual(pending?.runId, RUN);
    assert.strictEqual(pending?.correlationId, STEP);
    assert.strictEqual(pending?.kind, "thread.turn");
    assert.strictEqual(pending?.turnRetries, 1);
    assert.strictEqual(pending?.redriveArmed, true);
  }),
);

it.effect(
  "settleFailedTurn fails the run with the provider's reason once the budget is spent",
  () =>
    Effect.gen(function* () {
      const h = harness({ thread: threadWithPrompt() });
      yield* h.retry.settleFailedTurn(
        THREAD,
        { ...liveAsk, turnRetries: MAX_INTERRUPTED_TURN_REDRIVES },
        h.run,
        "Request timed out",
      );

      assert.deepStrictEqual(h.armed, []);
      assert.strictEqual(h.failed.length, 1);
      const message = (h.failed[0] as Error).message;
      assert.include(message, failedTurnMessage("Request timed out"));
      assert.include(message, STEP);
      assert.include(message, `${MAX_INTERRUPTED_TURN_REDRIVES} re-drives exhausted`);
    }),
);

it.effect("processTurnRetry re-issues the SAME prompt through thread.turn.resume", () =>
  Effect.gen(function* () {
    const h = harness({ thread: threadWithPrompt() });
    h.registry.setPending(THREAD, { ...liveAsk, turnRetries: 1 });
    yield* h.retry.processTurnRetry({ threadId: THREAD, correlationId: STEP });

    assert.strictEqual(h.dispatched.length, 1);
    const command = h.dispatched[0]!;
    assert.strictEqual(command.type, "thread.turn.resume");
    assert.ok(command.type === "thread.turn.resume");
    assert.strictEqual(String(command.threadId), THREAD);
    assert.strictEqual(String(command.messageId), "prompt-1");
    assert.deepStrictEqual(h.failed, []);
  }),
);

it.effect("settleFailedTurn fails the run instead of parking it when the prompt is gone", () =>
  Effect.gen(function* () {
    const h = harness({ thread: undefined });
    yield* h.retry.settleFailedTurn(THREAD, liveAsk, h.run, "gateway down");

    assert.deepStrictEqual(h.armed, []);
    assert.strictEqual(h.failed.length, 1);
    assert.match((h.failed[0] as Error).message, /can no longer be re-driven/);
  }),
);
