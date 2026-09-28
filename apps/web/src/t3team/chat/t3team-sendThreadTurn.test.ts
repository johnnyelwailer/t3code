import { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { threadEnvironment } from "~/state/threads";
import { runT3TeamEnvironmentCommand } from "~/t3team/t3team-environmentCommands";
import { sendT3TeamThreadTurn } from "./t3team-sendThreadTurn";

vi.mock("~/t3team/t3team-environmentCommands", () => ({
  runT3TeamEnvironmentCommand: vi.fn(async () => undefined),
}));
vi.mock("~/state/threads", () => ({
  threadEnvironment: { startTurn: { label: "thread:startTurn" } },
}));

const runCommand = vi.mocked(runT3TeamEnvironmentCommand);
const CLOUD_ENV = EnvironmentId.make("cloud-env");

beforeEach(() => {
  runCommand.mockReset();
  runCommand.mockResolvedValue(undefined);
});

describe("sendT3TeamThreadTurn", () => {
  it("starts a user turn on the addressed thread, on that thread's environment", async () => {
    await sendT3TeamThreadTurn({
      environmentId: CLOUD_ENV,
      threadId: "thread-9",
      text: "  please revise  ",
    });

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith(threadEnvironment.startTurn, {
      environmentId: CLOUD_ENV,
      input: expect.objectContaining({
        threadId: "thread-9",
        message: expect.objectContaining({ role: "user", text: "please revise", attachments: [] }),
      }),
    });
  });

  it("does nothing for empty text", async () => {
    await sendT3TeamThreadTurn({ environmentId: CLOUD_ENV, threadId: "thread-9", text: "   " });

    expect(runCommand).not.toHaveBeenCalled();
  });

  it("rejects when the server refuses the turn, so callers cannot assume delivery", async () => {
    runCommand.mockRejectedValueOnce(new Error("already has a turn in progress"));

    await expect(
      sendT3TeamThreadTurn({
        environmentId: CLOUD_ENV,
        threadId: "thread-9",
        text: "please revise",
      }),
    ).rejects.toThrow("already has a turn in progress");
  });
});
