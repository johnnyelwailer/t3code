import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { CommandId } from "@t3tools/contracts";

import { randomUUID } from "~/lib/utils";

import {
  markSendNotConfirmed,
  markSendPending,
  reopenSend,
  settleSend,
} from "./t3team-sendConfirmationStore";

/** One id per composer send: every retry of it, automatic or Retry, reuses it. */
export const newSendCommandId = () => CommandId.make(randomUUID());

export const beginSend = markSendPending;

type StartResult = AtomCommandResult<unknown, unknown>;

function isNotConfirmed(result: StartResult): boolean {
  if (result._tag !== "Failure") return false;
  const error: unknown = squashAtomCommandFailure(result);
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "SendNotConfirmedError"
  );
}

/**
 * Settles a composer send. A reply that never came keeps the message as "Not confirmed" with a
 * Retry that sends the very same request (same command id). Returns true when the caller must
 * keep the message on screen instead of putting the prompt back.
 */
export function confirmSend(input: {
  readonly messageId: string;
  readonly result: StartResult;
  readonly resend: () => Promise<StartResult>;
  readonly onRejected: (message: string) => void;
}): boolean {
  if (!isNotConfirmed(input.result)) {
    settleSend(input.messageId);
    return false;
  }
  markSendNotConfirmed(input.messageId, () => {
    reopenSend(input.messageId);
    void input.resend().then((result) => {
      if (result._tag === "Failure" && !isNotConfirmed(result)) {
        settleSend(input.messageId);
        const error = squashAtomCommandFailure(result);
        input.onRejected(error instanceof Error ? error.message : "Failed to send message.");
        return;
      }
      confirmSend({ ...input, result });
    });
  });
  return true;
}
