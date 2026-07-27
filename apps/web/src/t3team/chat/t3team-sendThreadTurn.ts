/**
 * The threadId-addressable send seam: start a turn on any thread from anywhere in the app.
 *
 * `ChatView`'s `onSend` is welded to that component's own local state (composer ref, active thread,
 * provider/model selection, image and terminal context), so surfaces outside the chat — the work
 * item's draft review, for example — had no way to put a message into a thread. This is the
 * minimum that is actually needed, and it is exactly what the inline-widget bridge already does
 * (`t3team-useWidgetBlockController.ts` `sendPrompt`), extracted so there is one path rather than
 * two copies.
 *
 * `runtimeMode` / `interactionMode` are required by the command schema but ignored by the server:
 * the decider re-reads them from the target thread (`apps/server/src/orchestration/decider.ts`,
 * `thread.turn.start`), so a caller that does not have the thread loaded cannot change its mode by
 * accident. `modelSelection` is optional for the same reason.
 */

import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ThreadId,
  type T3TeamMessageExt,
} from "@t3tools/contracts";

import { randomUUID } from "~/lib/utils";
import type { BackendApi } from "~/t3team/backend/t3team-types";

/**
 * Rejects when the turn could not be started — most commonly because the target thread already has
 * a turn in progress, which the server refuses. Callers must handle that rather than assume
 * delivery.
 */
export async function sendT3TeamThreadTurn(input: {
  readonly backend: BackendApi;
  readonly threadId: string;
  readonly text: string;
  readonly t3teamExt?: T3TeamMessageExt;
}): Promise<void> {
  const text = input.text.trim();
  if (text.length === 0) return;

  await input.backend.dispatchCommand({
    type: "thread.turn.start",
    commandId: CommandId.make(`web:t3team:turn:${randomUUID()}`),
    threadId: ThreadId.make(input.threadId),
    message: {
      messageId: MessageId.make(randomUUID()),
      role: "user",
      text,
      attachments: [],
      ...(input.t3teamExt ? { t3teamExt: input.t3teamExt } : {}),
    },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    createdAt: new Date().toISOString(),
  });
}
