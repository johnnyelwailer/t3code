import {
  CommandId,
  MessageId,
  type OrchestrationCommand,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";

const ISO = "2026-07-20T08:00:00.000Z";

export type T3TeamRecipeHarnessCapture = {
  /** Every orchestration command the run dispatched, in order. */
  readonly commands: OrchestrationCommand[];
  /** Agent prompts the run issued, in order, so a test can assert what was asked. */
  readonly agentPrompts: string[];
};

/**
 * Deterministic model stub at the SAME seam the engine's own reactor tests use
 * (`t3team-workflowEngineReactor.integration.test.ts`): on the engine's
 * `thread.turn-start-requested` domain event it dispatches the
 * `thread.message.assistant.delta` + `.complete` commands a real
 * `ProviderRuntimeIngestion` would. No gateway, no provider process, no network.
 *
 * `replies` is consumed in turn order; the last entry repeats if the run takes more turns.
 */
export function makeT3TeamRecipeHarnessStubProvider(input: {
  readonly replies: ReadonlyArray<string>;
  readonly capture: T3TeamRecipeHarnessCapture;
}) {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const orchestration = yield* OrchestrationEngineService;
      let turn = 0;
      yield* Effect.forkScoped(
        Stream.runForEach(orchestration.streamDomainEvents, (event) => {
          if (event.type !== "thread.turn-start-requested") return Effect.void;
          const { threadId, messageId: turnMessageId } = event.payload;
          const index = Math.min(turn, input.replies.length - 1);
          turn += 1;
          const reply = input.replies[index] ?? "{}";
          const assistantMessageId = MessageId.make(`harness-assistant:${turnMessageId}`);
          const turnId = TurnId.make(`harness-turn:${turnMessageId}`);
          return Effect.gen(function* () {
            yield* orchestration.dispatch({
              type: "thread.message.assistant.delta",
              commandId: CommandId.make(`harness:delta:${turnMessageId}`),
              threadId,
              messageId: assistantMessageId,
              delta: reply,
              turnId,
              createdAt: ISO,
            });
            yield* orchestration.dispatch({
              type: "thread.message.assistant.complete",
              commandId: CommandId.make(`harness:complete:${turnMessageId}`),
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
}

/** Answer a pending `askUser` the way a real user reply lands: a user message domain event. */
export function answerT3TeamRecipeHarnessAsk(input: {
  readonly launchThreadId: string;
  readonly answer: string;
  readonly nonce: string;
}) {
  return Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    yield* orchestration.dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make(`harness-user-reply:${input.nonce}`),
      threadId: ThreadId.make(input.launchThreadId),
      message: {
        messageId: MessageId.make(`harness-user-reply-msg:${input.nonce}`),
        role: "user",
        text: input.answer,
        turnId: null,
        streaming: false,
      },
      createdAt: ISO,
    });
  });
}
