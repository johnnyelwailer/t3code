import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { isLostReply } from "@t3tools/client-runtime/t3team-lostReply";
import { CommandId } from "@t3tools/contracts";

import { randomUUID } from "~/lib/utils";

import {
  markSendNotConfirmed,
  markSendPending,
  reopenSend,
  settleSend,
} from "./t3team-sendConfirmationStore";

type StartResult = AtomCommandResult<unknown, unknown>;

/** One id per composer send: every retry of it, automatic or Retry, reuses it. */
export const newSendCommandId = () => CommandId.make(randomUUID());

export const beginSend = markSendPending;

/**
 * - `confirmed`: the server answered.
 * - `rejected`: it answered no, so the turn did not run; the caller restores the prompt.
 * - `handed-off`: outcome unknown; the durable outbox holds it and re-sends the same id.
 * - `kept`: outcome unknown; the message stays as "Not confirmed" with Retry.
 */
export type SendOutcome = "confirmed" | "rejected" | "handed-off" | "kept";

interface ConfirmSendInput {
  readonly messageId: string;
  readonly result: StartResult;
  readonly resend: () => Promise<StartResult>;
  /** Hands the unconfirmed send to the durable outbox; false when the outbox cannot hold it. */
  readonly handOff: () => Promise<boolean>;
  readonly onRejectedRetry: (result: StartResult) => void;
}

const isUnknownOutcome = (result: StartResult) =>
  result._tag === "Failure" && isLostReply(result.cause);

/**
 * Settles a composer send. An unknown outcome is never put back in the composer: the outbox takes
 * it when it can (it survives a reload), otherwise it stays as "Not confirmed" with Retry.
 */
export function confirmSend(input: ConfirmSendInput): Promise<SendOutcome> {
  return settle(input, input.result, false);
}

async function settle(
  input: ConfirmSendInput,
  result: StartResult,
  retried: boolean,
): Promise<SendOutcome> {
  if (!isUnknownOutcome(result)) {
    settleSend(input.messageId);
    if (result._tag === "Success") return "confirmed";
    if (retried) input.onRejectedRetry(result);
    return "rejected";
  }
  if (await input.handOff()) {
    settleSend(input.messageId);
    return "handed-off";
  }
  markSendNotConfirmed(input.messageId, () => {
    reopenSend(input.messageId);
    void input.resend().then((next) => settle(input, next, true));
  });
  return "kept";
}
