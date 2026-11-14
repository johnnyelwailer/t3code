import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { RpcClientError } from "effect/rpc";
import * as Socket from "effect/socket/Socket";
import { describe, expect, it, vi } from "vite-plus/test";

import { beginSend, confirmSend } from "./t3team-confirmSend";
import { peekSend, threadHasPendingSend, trackSendInFlight } from "./t3team-sendConfirmationStore";

const socketClosed = () =>
  AsyncResult.failure(
    Cause.fail(
      new RpcClientError.RpcClientError({ reason: new Socket.SocketCloseError({ code: 1006 }) }),
    ),
  );
const defect = () =>
  AsyncResult.failure(
    Cause.fail(
      new RpcClientError.RpcClientError({
        reason: new RpcClientError.RpcClientDefect({ message: "bad reply", cause: null }),
      }),
    ),
  );
const rejected = () => AsyncResult.failure(Cause.fail(new Error("Previously rejected.")));
const sent = () => AsyncResult.success({ sequence: 1 });

function send(
  name: string,
  result: AtomCommandResult<unknown, unknown> = socketClosed(),
  handOff = false,
) {
  const messageId = `message-${name}`;
  const threadId = `thread-${name}`;
  beginSend(messageId, { threadId, environmentId: EnvironmentId.make("environment-1") });
  const resend = vi.fn();
  const onRejectedRetry = vi.fn();
  const outcome = confirmSend({
    messageId,
    result,
    resend,
    handOff: async () => handOff,
    onRejectedRetry,
  });
  return { messageId, threadId, resend, onRejectedRetry, outcome };
}

// Replays nx-nexi nexi-work/send-confirmation.statechart: NeverPutBack, NeverSwallowed, InOrder.
describe("confirmSend", () => {
  it("NeverPutBack: a lost reply is handed to the durable outbox, never put back", async () => {
    const lost = send("handed", socketClosed(), true);
    expect(await lost.outcome).toBe("handed-off");
    expect(threadHasPendingSend(lost.threadId)).toBe(false);
  });

  it("NeverPutBack: a lost reply the outbox cannot hold stays Not confirmed", async () => {
    const lost = send("kept");
    expect(await lost.outcome).toBe("kept");
    expect(peekSend(lost.messageId)?.status).toBe("not-confirmed");
    expect(threadHasPendingSend(lost.threadId)).toBe(true);
  });

  it("Retry shows Sending at once, resends the same request, and settles when confirmed", async () => {
    const lost = send("retry");
    await lost.outcome;
    lost.resend.mockResolvedValue(sent());
    peekSend(lost.messageId)?.retry?.();
    expect(peekSend(lost.messageId)).toMatchObject({ status: "sending", retried: true });
    await vi.waitFor(() => expect(threadHasPendingSend(lost.threadId)).toBe(false));
    expect(lost.resend).toHaveBeenCalledTimes(1);
  });

  it("NeverSwallowed: a Retry the server rejects puts the prompt back", async () => {
    const lost = send("rejected-retry");
    await lost.outcome;
    lost.resend.mockResolvedValue(rejected());
    peekSend(lost.messageId)?.retry?.();
    await vi.waitFor(() => expect(lost.onRejectedRetry).toHaveBeenCalledTimes(1));
    expect(threadHasPendingSend(lost.threadId)).toBe(false);
  });

  it("a first-send rejection and a client defect on a live connection are rejections", async () => {
    expect(await send("first-rejected", rejected()).outcome).toBe("rejected");
    expect(await send("defect", defect()).outcome).toBe("rejected");
    expect(await send("confirmed", sent()).outcome).toBe("confirmed");
  });

  it("InOrder: the thread counts as pending from the moment its send is in flight", () => {
    const ref = { current: false };
    const inFlight = trackSendInFlight(ref, "thread-preparing");
    inFlight.current = true;
    expect(threadHasPendingSend("thread-preparing")).toBe(true);
    inFlight.current = false;
    expect(threadHasPendingSend("thread-preparing")).toBe(false);
    expect(ref.current).toBe(false);
  });
});
