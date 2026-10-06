import { describe, expect, it } from "vite-plus/test";
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import { readT3TeamMessageExtContext } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { sendT3TeamThreadTurn } from "./t3team-sendThreadTurn";

function fakeBackend(input?: { readonly rejectWith?: string }) {
  const turns: StartThreadTurnInput[] = [];
  const backend = {
    orchestration: {
      async startThreadTurn(turn: StartThreadTurnInput) {
        if (input?.rejectWith) throw new Error(input.rejectWith);
        turns.push(turn);
      },
    },
  } as unknown as BackendApi;
  return { backend, commands: turns };
}

describe("sendT3TeamThreadTurn", () => {
  it("queues a user message on the addressed thread without any chat-view state", async () => {
    const { backend, commands } = fakeBackend();

    await sendT3TeamThreadTurn({ backend, threadId: "thread-9", text: "  please revise  " });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      threadId: "thread-9",
      dispatchMode: "queue",
      message: { role: "user", text: "please revise", attachments: [] },
    });
    expect(commands[0]?.message.context).toBeUndefined();
  });

  it("carries the fork message ext as a message context record", async () => {
    const { backend, commands } = fakeBackend();

    await sendT3TeamThreadTurn({
      backend,
      threadId: "thread-9",
      text: "Widget action: approve",
      t3teamExt: { displayText: "approve", visibleToUser: false },
    });

    expect(readT3TeamMessageExtContext(commands[0]?.message.context)).toEqual({
      displayText: "approve",
      visibleToUser: false,
    });
  });

  it("does nothing for empty text", async () => {
    const { backend, commands } = fakeBackend();

    await sendT3TeamThreadTurn({ backend, threadId: "thread-9", text: "   " });

    expect(commands).toEqual([]);
  });

  it("rejects when the server refuses the turn, so callers cannot assume delivery", async () => {
    const { backend } = fakeBackend({ rejectWith: "already has a turn in progress" });

    await expect(
      sendT3TeamThreadTurn({ backend, threadId: "thread-9", text: "please revise" }),
    ).rejects.toThrow("already has a turn in progress");
  });
});
