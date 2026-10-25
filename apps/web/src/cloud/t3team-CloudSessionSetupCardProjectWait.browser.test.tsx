import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { CloudSessionSetupCard } from "./t3team-CloudSessionSetupCard";
import { classifyCloudProjectWait } from "./t3team-cloudProjectWait";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";

/** The setup card renders no router links and reads no route, so it mounts without a router. */
const noRouter: { readonly router: false } = { router: false };

function session(overrides: Partial<CloudSession> = {}): CloudSession {
  return {
    sessionId: "session-1",
    providerKind: "github_actions",
    phase: "preparing",
    elapsedSeconds: 40,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim",
    failureReason: null,
    detailsUrl: null,
    ...overrides,
  };
}

describe("CloudSessionSetupCard project wait", () => {
  it("escalates from the project step's own start, not the session's age", async () => {
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    const queued = decodeCloudQueuedSend({
      messageId: "msg-1",
      messageText: "hi",
      outgoingText: "hi",
      titleSeed: "hi",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      sessionId: "session-1",
      sessionLabel: "machine",
      createdAt: new Date(now - 5_000).toISOString(),
      stepStartedAt: { project: new Date(now - 5_000).toISOString() },
    });
    const projectWait = classifyCloudProjectWait({
      environmentId: EnvironmentId.make("env-cloud"),
      scratch: false,
      machineSettingsLoaded: true,
      expectedCwd: "/workspace/app",
      scratchRoot: null,
      composer: null,
      projects: [],
    });
    using _timers = fakeTimers({ now });
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{
          session: session({ phase: "ready", elapsedSeconds: 600 }),
          machineConnected: true,
          delivery: "queued",
          queued: queued ?? undefined,
          projectWait,
        }}
      />,
      noRouter,
    );
    const level = () =>
      screen.container
        .querySelector("[data-cloud-project-wait]")
        ?.getAttribute("data-cloud-project-wait") ?? "none";
    expect(level()).toBe("none");
    const fill = () =>
      screen.container
        .querySelector("[data-cloud-setup-fill]")
        ?.getAttribute("data-cloud-setup-fill");
    expect(fill()).toBe("determinate");
    await act(() => vi.advanceTimersByTime(10_000));
    expect(level()).toBe("expected");
    await act(() => vi.advanceTimersByTime(74_000));
    expect(level()).toBe("expected");
    await act(() => vi.advanceTimersByTime(1_000));
    expect(level()).toBe("slow");
    expect(fill()).toBe("indeterminate");
  });
});
