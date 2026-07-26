/**
 * Publishes an agent-proposed draft mutation to the client's review surface.
 *
 * The `*.draft_*` broker tools only build a `draftMutation` payload; the tool result itself is not
 * a reliable transport to the client (each provider adapter reshapes tool results for display, and
 * the Claude adapter does not even classify every draft tool as an MCP call). So the draft rides
 * the one channel that is typed, ordered, persisted and replayed on reconnect: a message on the
 * proposing thread, carrying a `draft-mutation` attachment. The message is hidden from the user
 * (`visibleToUser: false`) and excluded from the agent's prompt context (`visibleToAgent: false`)
 * — it is transport, not conversation. Mirrors `t3team-widgetShowTool.ts`.
 */

import {
  CommandId,
  MessageId,
  ThreadId,
  type OrchestrationCommand,
  type T3TeamDraftMutationPayload,
  type T3TeamMessageDraftMutationAttachment,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { errorResult } from "./t3team-toolBrokerHelpers.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";

/** Takes a draft tool's result and returns it once the draft has reached the review surface. */
export type T3TeamDraftMutationPublisher = (
  result: T3TeamToolCallResult,
) => Effect.Effect<T3TeamToolCallResult>;

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Stamp the tool payload with the id the client keys the draft by. Deriving it from the carrier
 * message id makes ingestion idempotent: re-reading the thread re-reads the same id, so a draft the
 * reviewer already accepted or dismissed is never resurrected as a fresh proposal.
 */
export function buildT3TeamDraftMutationAttachment(input: {
  readonly draftMutation: Record<string, unknown>;
  readonly messageId: string;
}): T3TeamMessageDraftMutationAttachment {
  return {
    kind: "draft-mutation",
    draft: {
      ...input.draftMutation,
      id: `jira-draft:${input.messageId}`,
    } as unknown as T3TeamDraftMutationPayload,
  };
}

/** `undefined` when the result carries no draft (an error result, or a non-draft tool). */
export function readT3TeamDraftMutation(
  result: T3TeamToolCallResult,
): Record<string, unknown> | undefined {
  if (result.isError) return undefined;
  const draft = readRecord(readRecord(result.structuredContent)?.draftMutation);
  return draft?.kind === "jira-work-item-draft" ? draft : undefined;
}

export function makeT3TeamDraftMutationPublisher<TDispatchError>(input: {
  readonly threadId: string;
  readonly dispatch: (command: OrchestrationCommand) => Effect.Effect<unknown, TDispatchError>;
}): T3TeamDraftMutationPublisher {
  return (result) =>
    Effect.gen(function* () {
      const draftMutation = readT3TeamDraftMutation(result);
      if (!draftMutation) return result;

      const messageId = t3teamRandomUUID();
      const dispatched = yield* input
        .dispatch({
          type: "thread.message.upsert",
          commandId: CommandId.make(`server:t3team:draft:${t3teamRandomUUID()}`),
          threadId: ThreadId.make(input.threadId),
          message: {
            messageId: MessageId.make(messageId),
            role: "system",
            text: "",
            turnId: null,
            streaming: false,
            t3teamExt: {
              author: { kind: "system" },
              visibleToUser: false,
              visibleToAgent: false,
              attachments: [buildT3TeamDraftMutationAttachment({ draftMutation, messageId })],
            },
          },
          createdAt: DateTime.formatIso(yield* DateTime.now),
        })
        .pipe(Effect.result);

      // A draft the reviewer will never see is not a proposal. Fail loudly rather than telling the
      // agent its change is waiting for approval somewhere nobody is looking.
      if (dispatched._tag === "Failure") {
        return errorResult(
          "The draft was built but could not be published for review; nothing is pending. Retry, or make the change directly.",
        );
      }
      return result;
    });
}
