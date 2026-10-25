import { describe, expect, it } from "vite-plus/test";

import {
  CLOUD_PROJECT_WAIT_BOUND_SECONDS,
  CLOUD_PROJECT_WAIT_SETTLE_SECONDS,
  cloudProjectWaitDeadlineMs,
  isCloudProjectWaitExpired,
  trackMachineConnectedSince,
} from "./t3team-cloudProjectWaitBound";
import { decodeCloudQueuedSend, type CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

const BOUND_MS = CLOUD_PROJECT_WAIT_BOUND_SECONDS * 1000;
const SETTLE_MS = CLOUD_PROJECT_WAIT_SETTLE_SECONDS * 1000;
const T0 = Date.parse("2026-10-13T08:00:00.000Z");
const HOUR = 3_600_000;

function sendStampedAt(stampMs: number | null, createdAtMs = T0): CloudQueuedSend {
  return {
    ...decodeCloudQueuedSend({
      messageId: "msg-1",
      messageText: "hello",
      outgoingText: "hello",
      titleSeed: "hello",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      sessionId: "session-9",
      sessionLabel: "machine",
      createdAt: new Date(createdAtMs).toISOString(),
    })!,
    ...(stampMs === null ? {} : { stepStartedAt: { project: new Date(stampMs).toISOString() } }),
  };
}

describe("the Project ready bound", () => {
  it("never fires without the step's stamp or without a connected sighting", () => {
    expect(isCloudProjectWaitExpired(sendStampedAt(null), T0, T0 + 99 * HOUR)).toBe(false);
    expect(isCloudProjectWaitExpired(sendStampedAt(T0), null, T0 + 99 * HOUR)).toBe(false);
    expect(cloudProjectWaitDeadlineMs(sendStampedAt(null), T0)).toBeNull();
  });

  it("is exclusive just before the bound, reached exactly at it, over just after", () => {
    const send = sendStampedAt(T0);
    expect(isCloudProjectWaitExpired(send, T0, T0 + BOUND_MS - 1)).toBe(false);
    expect(isCloudProjectWaitExpired(send, T0, T0 + BOUND_MS)).toBe(true);
    expect(isCloudProjectWaitExpired(send, T0, T0 + BOUND_MS + 1)).toBe(true);
  });

  it("counts from the step's stamp, not from the session's or the message's age", () => {
    // Queued 12 h ago (a long provisioning), the project step began 10 s ago.
    const send = sendStampedAt(T0 + 12 * HOUR - 10_000, T0);
    const now = T0 + 12 * HOUR;
    expect(isCloudProjectWaitExpired(send, now - 20_000, now)).toBe(false);
    expect(isCloudProjectWaitExpired(send, now - 20_000, now + BOUND_MS - 10_000)).toBe(true);
  });

  it("counts from the original stamp after an app restart, once the machine has settled", () => {
    // Stamped at T0; the app was closed for 2 h and reopens: this window sees "connected" now.
    const send = sendStampedAt(T0);
    const relaunch = T0 + 2 * HOUR;
    expect(isCloudProjectWaitExpired(send, relaunch, relaunch)).toBe(false);
    expect(isCloudProjectWaitExpired(send, relaunch, relaunch + SETTLE_MS - 1)).toBe(false);
    expect(isCloudProjectWaitExpired(send, relaunch, relaunch + SETTLE_MS)).toBe(true);
    // A relaunch inside the bound does not extend it.
    const early = T0 + 60_000;
    expect(cloudProjectWaitDeadlineMs(send, early)).toBe(T0 + BOUND_MS);
  });

  it("survives a clock set back: the deadline stays where the stamp put it, never negative", () => {
    const send = sendStampedAt(T0);
    // Wall clock jumped a day back after the stamp: not expired, and not expiring early either.
    expect(isCloudProjectWaitExpired(send, T0 - 24 * HOUR, T0 - 24 * HOUR + BOUND_MS)).toBe(false);
    expect(cloudProjectWaitDeadlineMs(send, T0 - 24 * HOUR)).toBe(T0 + BOUND_MS);
  });

  it("fires after a clock jump forward, but only once the machine has settled", () => {
    const send = sendStampedAt(T0);
    const jumped = T0 + 24 * HOUR;
    // The window has seen the machine connected since before the jump: due at once.
    expect(isCloudProjectWaitExpired(send, T0 + 1_000, jumped)).toBe(true);
    // A window that only just saw it connected still waits out the settle period.
    expect(isCloudProjectWaitExpired(send, jumped - 1_000, jumped)).toBe(false);
  });
});

describe("machine connection flapping", () => {
  it("does not restart the bound: only the settle period is deferred, never past the stamp's bound", () => {
    const send = sendStampedAt(T0);
    const seen = new Map<string, number>();
    // Connected, drops at +100 s, back at +150 s.
    expect(trackMachineConnectedSince(seen, "env", true, T0 + 1_000)).toBe(T0 + 1_000);
    expect(trackMachineConnectedSince(seen, "env", true, T0 + 90_000)).toBe(T0 + 1_000);
    expect(trackMachineConnectedSince(seen, "env", false, T0 + 100_000)).toBeNull();
    const back = trackMachineConnectedSince(seen, "env", true, T0 + 150_000)!;
    expect(back).toBe(T0 + 150_000);
    // The bound is still the stamp's 180 s, not 150 s + 180 s.
    expect(cloudProjectWaitDeadlineMs(send, back)).toBe(T0 + BOUND_MS);
    // Flapping again right at the bound defers by the settle period at most.
    const lastFlap = T0 + BOUND_MS - 1_000;
    expect(cloudProjectWaitDeadlineMs(send, lastFlap)).toBe(lastFlap + SETTLE_MS);
    expect(isCloudProjectWaitExpired(send, lastFlap, lastFlap + SETTLE_MS)).toBe(true);
  });

  it("starts the sighting over when the clock was set back", () => {
    const seen = new Map<string, number>();
    trackMachineConnectedSince(seen, "env", true, T0);
    expect(trackMachineConnectedSince(seen, "env", true, T0 - 24 * HOUR)).toBe(T0 - 24 * HOUR);
  });

  it("tracks environments separately and forgets a disconnected one", () => {
    const seen = new Map<string, number>();
    trackMachineConnectedSince(seen, "a", true, 1);
    trackMachineConnectedSince(seen, "b", true, 2);
    expect(trackMachineConnectedSince(seen, "a", false, 3)).toBeNull();
    expect(trackMachineConnectedSince(seen, "b", true, 4)).toBe(2);
    expect(trackMachineConnectedSince(seen, "a", true, 5)).toBe(5);
  });
});
