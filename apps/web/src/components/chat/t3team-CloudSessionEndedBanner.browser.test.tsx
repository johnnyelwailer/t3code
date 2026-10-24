import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { fakeTimers, render } from "../../../test/render";

const environmentId = EnvironmentId.make("env-ws");
const NOW = Date.parse("2026-10-24T12:00:00Z");
let ended = false;
let sessions: CloudSession[] = [];

vi.mock("~/cloud/t3team-useEnvironmentLiveState", () => ({
  useEnvironmentSessionEnded: () => ended,
}));
vi.mock("~/state/t3team-cloudSessions", () => ({
  useCloudSessions: () => ({ sessions }),
}));
vi.mock("../cloud/t3team-CloudSessionEndedActions", () => ({
  CloudSessionEndedActions: () => <button type="button">Start another cloud session</button>,
}));

const { useCloudSessionEndedBannerItem } = await import("./t3team-CloudSessionEndedBanner");

function Probe() {
  const item = useCloudSessionEndedBannerItem(environmentId);
  return item === null ? (
    <span data-testid="none" />
  ) : (
    <div>
      <b>{item.title}</b>
      <i>{item.description}</i>
      {item.actions}
    </div>
  );
}

/** A ready session that started `startedAgoSeconds` ago with `remaining` left. */
function ready(startedAgoSeconds: number, remaining: number): CloudSession {
  return {
    sessionId: "1",
    providerKind: "github_actions",
    phase: "ready",
    environmentId: "env-ws",
    startedAt: new Date(NOW - startedAgoSeconds * 1000).toISOString(),
    elapsedSeconds: startedAgoSeconds,
    remainingSeconds: remaining,
    machineLabel: "ubuntu",
    failureReason: null,
    detailsUrl: null,
  };
}

describe("useCloudSessionEndedBannerItem", () => {
  it("shows nothing for a healthy session with hours left", async () => {
    using _timers = fakeTimers({ now: NOW });
    ended = false;
    sessions = [ready(600, 5 * 3600)];
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.querySelector("[data-testid=none]")).not.toBeNull();
  });

  it("warns at 15 minutes or less, saying the work is saved", async () => {
    using _timers = fakeTimers({ now: NOW });
    ended = false;
    sessions = [ready(345 * 60 - 14 * 60, 14 * 60)];
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.querySelector("b")?.textContent).toBe("Session ends in 14 min");
    expect(screen.container.querySelector("i")?.textContent).toBe(
      "Work is saved — you can continue in a new session.",
    );
  });

  it("says the session ended, and offers Start another, once the connection was parked on it", async () => {
    using _timers = fakeTimers({ now: NOW });
    ended = true;
    sessions = [];
    await using screen = await render(<Probe />, { router: false });
    expect(screen.container.querySelector("b")?.textContent).toBe("This cloud session has ended");
    expect(screen.container.textContent).toContain("Start another cloud session");
  });
});
