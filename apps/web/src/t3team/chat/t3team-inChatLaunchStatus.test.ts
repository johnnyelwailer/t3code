import { describe, expect, it } from "vite-plus/test";

import { resolveInChatLaunchStatus } from "~/t3team/chat/t3team-inChatLaunchStatus";

describe("resolveInChatLaunchStatus", () => {
  it("shows server-create progress as soon as the local thread exists", () => {
    expect(
      resolveInChatLaunchStatus({ hasServerThread: false, bootstrapStatus: "running" }),
    ).toEqual({
      show: true,
      phase: "creating",
    });
  });

  it("keeps progress in the open chat after the server shell exists", () => {
    expect(
      resolveInChatLaunchStatus({ hasServerThread: true, bootstrapStatus: "running" }),
    ).toEqual({
      show: true,
      phase: "preparing",
    });
  });

  it("keeps a launch failure visible after the shell exists", () => {
    expect(resolveInChatLaunchStatus({ hasServerThread: true, bootstrapStatus: "failed" })).toEqual(
      {
        show: true,
        phase: null,
      },
    );
  });

  it("hides the status once the launch has settled", () => {
    expect(resolveInChatLaunchStatus({ hasServerThread: true, bootstrapStatus: "idle" })).toEqual({
      show: false,
      phase: null,
    });
  });
});
