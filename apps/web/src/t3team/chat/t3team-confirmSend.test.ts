import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { beginSend, confirmSend } from "./t3team-confirmSend";
import { peekSend, threadHasPendingSend } from "./t3team-sendConfirmationStore";

const notConfirmed = () =>
  AsyncResult.failure(Cause.fail({ _tag: "SendNotConfirmedError", commandId: "command-1" }));
const rejected = () => AsyncResult.failure(Cause.fail(new Error("Previously rejected.")));
const sent = () => AsyncResult.success({ sequence: 1 });

function lostReply(name: string) {
  const messageId = `message-${name}`;
  const threadId = `thread-${name}`;
  beginSend(messageId, { threadId, environmentId: "environment-1" });
  const resend = vi.fn();
  const onRejected = vi.fn();
  const kept = confirmSend({ messageId, result: notConfirmed(), resend, onRejected });
  return { messageId, threadId, resend, onRejected, kept };
}

// Replays the paths of nx-nexi nexi-work/send-confirmation.statechart: NeverPutBack, NeverTwice, InOrder.
describe("confirmSend", () => {
  it("keeps a send whose reply never came as not confirmed; its thread's queue waits", () => {
    const send = lostReply("kept");
    expect(send.kept).toBe(true);
    expect(peekSend(send.messageId)?.status).toBe("not-confirmed");
    expect(threadHasPendingSend(send.threadId)).toBe(true);
    expect(send.resend).not.toHaveBeenCalled();
  });

  it("Retry resends the same request once and settles when confirmed", async () => {
    const send = lostReply("retry");
    send.resend.mockResolvedValue(sent());
    peekSend(send.messageId)?.retry?.();
    expect(peekSend(send.messageId)?.status).toBe("sending");
    await vi.waitFor(() => expect(threadHasPendingSend(send.threadId)).toBe(false));
    expect(send.resend).toHaveBeenCalledTimes(1);
    expect(send.onRejected).not.toHaveBeenCalled();
  });

  it("Retry that is still not confirmed offers Retry again", async () => {
    const send = lostReply("again");
    send.resend.mockResolvedValue(notConfirmed());
    peekSend(send.messageId)?.retry?.();
    await vi.waitFor(() => expect(peekSend(send.messageId)?.status).toBe("not-confirmed"));
  });

  it("a rejected Retry settles and reports why", async () => {
    const send = lostReply("rejected");
    send.resend.mockResolvedValue(rejected());
    peekSend(send.messageId)?.retry?.();
    await vi.waitFor(() => expect(send.onRejected).toHaveBeenCalledWith("Previously rejected."));
    expect(threadHasPendingSend(send.threadId)).toBe(false);
  });

  it("a confirmed or rejected first answer settles at once", () => {
    for (const result of [sent(), rejected()]) {
      beginSend("message-direct", { threadId: "thread-direct", environmentId: "environment-1" });
      const kept = confirmSend({
        messageId: "message-direct",
        result,
        resend: vi.fn(),
        onRejected: vi.fn(),
      });
      expect(kept).toBe(false);
      expect(threadHasPendingSend("thread-direct")).toBe(false);
    }
  });
});
