/**
 * The threadId-addressable send seam: start a turn on any thread from anywhere in the app.
 *
 * `ChatView`'s `onSend` is welded to that component's own local state (composer ref, active thread,
 * provider/model selection, image and terminal context), so surfaces outside the chat — the work
 * item's draft review, for example — had no way to put a message into a thread. This is the
 * minimum that is actually needed, extracted so there is one path rather than two copies.
 *
 * The message is QUEUED behind an active run (`dispatchMode: "queue"`, the server queue), never
 * steered into it: a send from outside the chat must not change what the agent is doing right now.
 * `runtimeMode` / `interactionMode` are required by the client operation but the server keeps the
 * thread's own modes for a `message.dispatch`, so a caller without the thread loaded cannot change
 * them by accident.
 */

import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ThreadId,
  withT3TeamMessageExtContext,
  type T3TeamMessageExt,
} from "@t3tools/contracts";

import { randomUUID } from "~/lib/utils";
import type { BackendApi } from "~/t3team/backend/t3team-types";

/** Rejects when the message could not be dispatched; callers must handle that rather than assume delivery. */
export async function sendT3TeamThreadTurn(input: {
  readonly backend: BackendApi;
  readonly threadId: string;
  readonly text: string;
  readonly t3teamExt?: T3TeamMessageExt;
}): Promise<void> {
  const text = input.text.trim();
  if (text.length === 0) return;
  const context = input.t3teamExt ? withT3TeamMessageExtContext(input.t3teamExt) : undefined;

  await input.backend.orchestration.startThreadTurn({
    threadId: ThreadId.make(input.threadId),
    message: {
      messageId: MessageId.make(randomUUID()),
      role: "user",
      text,
      attachments: [],
      ...(context ? { context } : {}),
    },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    dispatchMode: "queue",
  });
}
