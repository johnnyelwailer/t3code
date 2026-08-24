import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

/**
 * `t3team.thread.read_message` — read the FULL body of a previously delivered
 * inter-agent ("actor") message in the current thread. Long inter-agent bodies
 * are summarized on delivery (see t3team-actorReactionInput.ts); the summary
 * marker carries the message id, and this tool makes the full persisted body
 * reachable on demand. The full body is already persisted on the first-class
 * `actor`-role message recorded in the thread — no new storage.
 */

const READ_MESSAGE_TOOL_ID = "t3team.thread.read_message";

type ReadMessageThreadMessage = {
  readonly id: string;
  readonly role: string;
  readonly text?: string | null | undefined;
  readonly createdAt?: string | undefined;
  readonly t3teamExt?:
    | {
        readonly actor?: { readonly senderThreadId: string } | undefined;
      }
    | null
    | undefined;
};

export type ReadMessageThreadDetail = {
  readonly title?: string | undefined;
  readonly messages: ReadonlyArray<ReadMessageThreadMessage>;
};

type ReadMessageArgs = {
  readonly message_id?: unknown;
};

export function callT3TeamReadMessageTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId;
  readonly loadThreadDetail?: (
    threadId: ThreadId,
  ) => Effect.Effect<ReadMessageThreadDetail | undefined, string>;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { tool, toolArgs, threadId, loadThreadDetail } = input;
  if (!threadId || !loadThreadDetail) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }

  const args = (toolArgs ?? {}) as ReadMessageArgs;
  const messageId = typeof args.message_id === "string" ? args.message_id.trim() : "";
  if (messageId.length === 0) {
    return Effect.succeed(
      errorResult(`${READ_MESSAGE_TOOL_ID} requires a non-empty 'message_id' string.`),
    );
  }

  return Effect.gen(function* () {
    const read = yield* loadThreadDetail(threadId).pipe(Effect.result);
    if (read._tag === "Failure") {
      return errorResult(`Could not read the current thread: ${read.failure}`);
    }
    const thread = read.success;
    if (!thread) {
      return errorResult("Could not read the current thread.");
    }

    // The full body lives on the first-class `actor`-role message recorded in
    // this thread when the message was delivered (see the `thread.actor.message`
    // decider case). Restricting to `actor`-role messages keeps this tool scoped
    // to inter-agent delivery rather than arbitrary thread history.
    const match = thread.messages.find(
      (message) => message.id === messageId && message.role === "actor",
    );
    if (!match || match.text === undefined || match.text === null) {
      return errorResult(
        `No inter-agent message with id '${messageId}' in this thread. ` +
          "The full body is only readable in the thread the message was delivered to.",
      );
    }

    return okResult({
      ok: true,
      messageId,
      ...(match.t3teamExt?.actor?.senderThreadId
        ? { fromThreadId: match.t3teamExt.actor.senderThreadId }
        : {}),
      ...(match.createdAt ? { createdAt: match.createdAt } : {}),
      charCount: match.text.length,
      text: match.text,
    });
  });
}
