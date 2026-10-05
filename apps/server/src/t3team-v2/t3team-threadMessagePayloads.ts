/**
 * Pure payload builders for run-less messages (see t3team-threadMessageRecorder.ts):
 * the `message.updated` message and its timeline turn item, plus the identity
 * and equality rules the recorder's idempotency rests on.
 */
import {
  type MessageId,
  OrchestrationMessageContext,
  type OrchestrationV2Actor,
  type OrchestrationV2ConversationMessage,
  type OrchestrationV2CreationSource,
  type OrchestrationV2TurnItem,
  type ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import type * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

export interface RecordThreadMessageInput {
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly role: OrchestrationV2ConversationMessage["role"];
  readonly text: string;
  readonly context?: OrchestrationMessageContext;
  readonly senderThreadId?: ThreadId;
  /** Defaults: user → "user", assistant → "agent", system → "system". */
  readonly createdBy?: OrchestrationV2Actor;
  readonly creationSource?: OrchestrationV2CreationSource;
}

/** The turn item id is derived from the caller's deterministic message id. */
export const recorderTurnItemId = (messageId: MessageId) =>
  TurnItemId.make(`t3team:turn-item:${messageId}`);

const contextEquivalence = Schema.toEquivalence(OrchestrationMessageContext);

/** True when re-recording `input` over `existing` would change nothing. */
export const isSameRecordedMessage = (
  existing: OrchestrationV2ConversationMessage,
  input: RecordThreadMessageInput,
) =>
  existing.role === input.role &&
  existing.text === input.text &&
  (existing.context === undefined || input.context === undefined
    ? existing.context === input.context
    : contextEquivalence(existing.context, input.context));

const defaultActor = (role: RecordThreadMessageInput["role"]): OrchestrationV2Actor =>
  role === "user" ? "user" : role === "assistant" ? "agent" : "system";

export function buildRunlessMessagePayloads(input: {
  readonly message: RecordThreadMessageInput;
  readonly ordinal: number;
  readonly createdAt: DateTime.Utc;
  readonly now: DateTime.Utc;
}): {
  readonly message: OrchestrationV2ConversationMessage;
  readonly turnItem: OrchestrationV2TurnItem;
} {
  const { message: record, ordinal, createdAt, now } = input;
  const createdBy = record.createdBy ?? defaultActor(record.role);
  const creationSource = record.creationSource ?? "server";
  const optional = {
    ...(record.context === undefined ? {} : { context: record.context }),
    ...(record.senderThreadId === undefined ? {} : { senderThreadId: record.senderThreadId }),
  };
  const message: OrchestrationV2ConversationMessage = {
    ...optional,
    createdBy,
    creationSource,
    id: record.messageId,
    threadId: record.threadId,
    runId: null,
    nodeId: null,
    role: record.role,
    text: record.text,
    attachments: [],
    streaming: false,
    createdAt,
    updatedAt: now,
  };
  const base = {
    id: recorderTurnItemId(record.messageId),
    threadId: record.threadId,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: "completed" as const,
    title: null,
    startedAt: createdAt,
    completedAt: now,
    updatedAt: now,
  };
  const turnItem: OrchestrationV2TurnItem =
    record.role === "user"
      ? {
          ...base,
          ...optional,
          createdBy,
          creationSource,
          type: "user_message",
          messageId: record.messageId,
          inputIntent: "turn_start",
          text: record.text,
          attachments: [],
        }
      : record.role === "assistant"
        ? {
            ...base,
            type: "assistant_message",
            messageId: record.messageId,
            text: record.text,
            streaming: false,
          }
        : { ...base, type: "system_notice", message: record.text };
  return { message, turnItem };
}
