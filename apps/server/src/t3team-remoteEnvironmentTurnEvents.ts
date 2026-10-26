/**
 * Builds the local adapter events of one `remoteEnvironment` turn (`t3team-remoteEnvironmentTurn.ts`
 * reads the remote projection; this writes what the session publishes). Events are built as their
 * JSON form and decoded through `ProviderAdapterV2Event`, the schema every adapter event must
 * satisfy.
 */
import {
  ProviderAdapterProtocolError,
  ProviderAdapterV2Event,
  type ProviderAdapterV2TurnInput,
} from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  REMOTE_ENVIRONMENT_DRIVER,
  type RemoteTurnTerminal,
} from "./t3team-remoteEnvironmentTurn.ts";

const decodeEvent = Schema.decodeUnknownEffect(Schema.toCodecJson(ProviderAdapterV2Event));

/** Builds the local events of one turn; every event is checked against the adapter schema. */
export const makeRemoteTurnEvents = (turn: ProviderAdapterV2TurnInput, nowIso: () => string) => {
  const driver = REMOTE_ENVIRONMENT_DRIVER;
  const providerThreadId = turn.providerThread.id;
  const providerTurnId = `provider-turn:${turn.attemptId}`;
  const base = { threadId: turn.threadId, runId: turn.runId, nodeId: turn.rootNodeId };
  const startedAt = nowIso();
  const providerTurn = (
    status: "running" | "completed" | "interrupted" | "failed" | "cancelled",
  ) => ({
    type: "provider_turn.updated",
    driver,
    providerTurn: {
      id: providerTurnId,
      providerThreadId,
      nodeId: turn.rootNodeId,
      runAttemptId: turn.attemptId,
      nativeTurnRef: { driver, nativeId: `remote:${turn.message.messageId}`, strength: "strong" },
      ordinal: turn.providerTurnOrdinal,
      status,
      startedAt,
      completedAt: status === "running" ? null : nowIso(),
    },
  });
  const decode = (json: unknown) =>
    decodeEvent(json).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderAdapterProtocolError({ driver, detail: "invalid remote turn event", cause }),
      ),
    );
  const assistantMessage = (
    message: { readonly id: string; readonly text: string },
    index: number,
    streaming: boolean,
  ) => {
    const messageId = `message:${turn.attemptId}:remote:${message.id}`;
    const at = nowIso();
    return [
      {
        type: "message.updated",
        driver,
        message: {
          ...base,
          id: messageId,
          role: "assistant",
          text: message.text,
          attachments: [],
          streaming,
          createdAt: at,
          updatedAt: at,
          createdBy: "agent",
          creationSource: "provider",
        },
      },
      {
        type: "turn_item.updated",
        driver,
        turnItem: {
          ...base,
          id: `turn-item:${messageId}`,
          type: "assistant_message",
          messageId,
          text: message.text,
          streaming,
          providerThreadId,
          providerTurnId,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: index + 1,
          status: streaming ? "running" : "completed",
          title: null,
          startedAt: at,
          completedAt: streaming ? null : at,
          updatedAt: at,
        },
      },
    ];
  };
  const terminalEvents = (terminal: RemoteTurnTerminal, assistantCount: number) => {
    const end = {
      type: "turn.terminal",
      driver,
      providerThreadId,
      providerTurnId,
      runOrdinal: turn.runOrdinal,
      threadDisposition: "reusable",
    };
    if (terminal.status === "failed") {
      return [
        providerTurn("failed"),
        {
          ...end,
          status: "failed",
          failureItemOrdinal: assistantCount + 1,
          failure: {
            class: "provider_error",
            message: terminal.message,
            code: null,
            retryable: false,
          },
        },
      ];
    }
    return [
      providerTurn(terminal.status === "completed" ? "completed" : terminal.status),
      { ...end, status: terminal.status, failure: null },
    ];
  };
  return {
    running: () => decode(providerTurn("running")),
    assistant: (
      messages: ReadonlyArray<{ readonly id: string; readonly text: string }>,
      streaming: boolean,
    ) =>
      Effect.forEach(
        messages.flatMap((message, index) => assistantMessage(message, index, streaming)),
        decode,
      ),
    terminal: (terminal: RemoteTurnTerminal, assistantCount: number) =>
      Effect.forEach(terminalEvents(terminal, assistantCount), decode),
  };
};
