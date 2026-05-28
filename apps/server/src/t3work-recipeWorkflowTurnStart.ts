import * as Effect from "effect/Effect";
import {
  CommandId,
  MessageId,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ThreadId,
} from "@t3tools/contracts";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";

export const dispatchRecipeWorkflowTurnStart = Effect.fn("dispatchRecipeWorkflowTurnStart")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    threadId: ThreadId;
    userTurnMessage: string;
    createdAt: string;
    modelSelection: ModelSelection;
    runtimeMode: RuntimeMode;
    interactionMode: ProviderInteractionMode;
    titleSeed?: string;
    commandPrefix: string;
  }) {
    yield* input.orchestration.dispatch({
      type: "thread.turn.start",
      commandId: CommandId.make(`server:t3work:${input.commandPrefix}:${crypto.randomUUID()}`),
      threadId: input.threadId,
      message: {
        messageId: MessageId.make(
          `server:t3work:${input.commandPrefix}-message:${crypto.randomUUID()}`,
        ),
        role: "user",
        text: input.userTurnMessage,
        attachments: [],
      },
      modelSelection: input.modelSelection as never,
      ...(input.titleSeed ? { titleSeed: input.titleSeed as never } : {}),
      runtimeMode: input.runtimeMode as never,
      interactionMode: input.interactionMode as never,
      createdAt: input.createdAt,
    });
  },
);
