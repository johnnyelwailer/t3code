import { describe, expect, it } from "vite-plus/test";
import type { ClientOrchestrationCommand } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { sendT3TeamThreadTurn } from "./t3team-sendThreadTurn";

function fakeBackend(input?: { readonly rejectWith?: string }) {
  const commands: ClientOrchestrationCommand[] = [];
  const backend = {
    async dispatchCommand(command: ClientOrchestrationCommand) {
      if (input?.rejectWith) throw new Error(input.rejectWith);
      commands.push(command);
    },
  } as unknown as BackendApi;
  return { backend, commands };
}

describe("sendT3TeamThreadTurn", () => {
  it("starts a user turn on the addressed thread without any chat-view state", async () => {
    const { backend, commands } = fakeBackend();

    await sendT3TeamThreadTurn({ backend, threadId: "thread-9", text: "  please revise  " });

    expect(commands).toHaveLength(1);
    const command = commands[0]!;
    expect(command.type).toBe("thread.turn.start");
    expect(command).toMatchObject({
      threadId: "thread-9",
      message: { role: "user", text: "please revise", attachments: [] },
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
