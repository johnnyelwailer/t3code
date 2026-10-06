import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

/**
 * `t3team.thread.read_message` — read the FULL body of an inter-agent message
 * delivered to the current thread (`t3_thread_send` mode "mailbox"). Long
 * bodies reach the recipient's digest as a subject plus a marker carrying the
 * message id; the full body stays in the durable mailbox
 * (t3team-actorMailbox.ts), which this tool reads. Scoped to the recipient:
 * another thread's mailbox is not readable.
 */

const READ_MESSAGE_TOOL_ID = "t3team.thread.read_message";

export interface ReadMessageMailboxEntry {
  readonly fromThreadId: string;
  readonly text: string;
  readonly createdAt: string;
}

type ReadMessageArgs = {
  readonly message_id?: unknown;
};

export function callT3TeamReadMessageTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId;
  readonly readMailboxMessage?: (
    threadId: ThreadId,
    messageId: string,
  ) => Effect.Effect<ReadMessageMailboxEntry | null, string>;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { tool, toolArgs, threadId, readMailboxMessage } = input;
  if (!threadId || !readMailboxMessage) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }

  const args = (toolArgs ?? {}) as ReadMessageArgs;
  const messageId = typeof args.message_id === "string" ? args.message_id.trim() : "";
  if (messageId.length === 0) {
    return Effect.succeed(
      errorResult(`${READ_MESSAGE_TOOL_ID} requires a non-empty 'message_id' string.`),
    );
  }

  return readMailboxMessage(threadId, messageId).pipe(
    Effect.map((entry) =>
      entry === null
        ? errorResult(
            `No inter-agent message with id '${messageId}' in this thread. ` +
              "The full body is only readable in the thread the message was delivered to.",
          )
        : okResult({
            ok: true,
            messageId,
            fromThreadId: entry.fromThreadId,
            createdAt: entry.createdAt,
            charCount: entry.text.length,
            text: entry.text,
          }),
    ),
    Effect.catch((error) => Effect.succeed(errorResult(`Could not read the message: ${error}`))),
  );
}
