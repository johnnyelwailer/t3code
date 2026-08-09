/**
 * The orchestration commands a REAL agent turn produces, as one reusable builder for the stub
 * providers that stand in for a provider adapter in the workflow-engine tests
 * (`t3team-recipeWorkflowHarnessStub.ts`, the reactor + turn-answer integration tests).
 *
 * Fidelity is the whole point: the reactor resolves an `askAgent` from these events, so a stub
 * that emits a different shape proves nothing. `ProviderRuntimeIngestion` dispatches, per turn:
 *
 *   1. `thread.session.set` with the turn ACTIVE (its `turn.started` → status `running`);
 *   2. per assistant message, `thread.message.assistant.delta` (the text — one per streamed
 *      chunk) then `thread.message.assistant.complete` (an EMPTY `streaming: false` marker);
 *   3. `thread.session.set` with `activeTurnId: null` (its `turn.completed`) — the turn-end
 *      signal the reactor settles on.
 *
 * A turn with several messages (a preamble, then the answer) is just several entries in
 * {@link StubAgentTurn.messages}; an empty array is a turn that answered nothing.
 */

import {
  CommandId,
  MessageId,
  type OrchestrationCommand,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

export interface StubAgentTurn {
  readonly threadId: string;
  /** Unique per turn — every command/message/turn id is derived from it. */
  readonly idPrefix: string;
  /** One entry per complete assistant message, each split into its streamed delta chunks. */
  readonly messages: ReadonlyArray<ReadonlyArray<string>>;
  readonly createdAt: string;
  /** How the session ends: `ready` after a normal turn, `error` for a failed one. */
  readonly endStatus?: "ready" | "error";
}

const session = (input: {
  readonly threadId: string;
  readonly status: "running" | "ready" | "error";
  readonly activeTurnId: string | null;
  readonly createdAt: string;
}) => ({
  threadId: ThreadId.make(input.threadId),
  status: input.status,
  providerName: "stub-provider",
  runtimeMode: "full-access" as const,
  activeTurnId: input.activeTurnId === null ? null : TurnId.make(input.activeTurnId),
  lastError: null,
  updatedAt: input.createdAt,
});

/** Every command one stubbed agent turn dispatches, in the order ingestion dispatches them. */
export function stubAgentTurnCommands(turn: StubAgentTurn): ReadonlyArray<OrchestrationCommand> {
  const threadId = ThreadId.make(turn.threadId);
  const turnId = TurnId.make(`${turn.idPrefix}:turn`);
  const commands: OrchestrationCommand[] = [
    {
      type: "thread.session.set",
      commandId: CommandId.make(`${turn.idPrefix}:session-running`),
      threadId,
      session: {
        ...session({
          threadId: turn.threadId,
          status: "running",
          activeTurnId: `${turn.idPrefix}:turn`,
          createdAt: turn.createdAt,
        }),
      },
      createdAt: turn.createdAt,
    },
  ];
  for (const [index, chunks] of turn.messages.entries()) {
    const messageId = MessageId.make(`${turn.idPrefix}:assistant-${index}`);
    for (const [chunk, delta] of chunks.entries()) {
      commands.push({
        type: "thread.message.assistant.delta",
        commandId: CommandId.make(`${turn.idPrefix}:delta-${index}-${chunk}`),
        threadId,
        messageId,
        delta,
        turnId,
        createdAt: turn.createdAt,
      });
    }
    commands.push({
      type: "thread.message.assistant.complete",
      commandId: CommandId.make(`${turn.idPrefix}:complete-${index}`),
      threadId,
      messageId,
      turnId,
      createdAt: turn.createdAt,
    });
  }
  commands.push({
    type: "thread.session.set",
    commandId: CommandId.make(`${turn.idPrefix}:session-idle`),
    threadId,
    session: {
      ...session({
        threadId: turn.threadId,
        status: turn.endStatus ?? "ready",
        activeTurnId: null,
        createdAt: turn.createdAt,
      }),
    },
    createdAt: turn.createdAt,
  });
  return commands;
}
