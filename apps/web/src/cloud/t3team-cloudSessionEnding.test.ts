import { describe, expect, it } from "vite-plus/test";

import {
  SESSION_ENDING_WARNING_SECONDS,
  resolveSessionEndingNotice,
  secondsUntil,
  sessionEndsAtMs,
} from "./t3team-cloudSessionEnding";

describe("resolveSessionEndingNotice", () => {
  it("stays quiet while there is plenty of time, or no reading", () => {
    expect(resolveSessionEndingNotice(null)).toBeNull();
    expect(resolveSessionEndingNotice(SESSION_ENDING_WARNING_SECONDS + 1)).toBeNull();
  });

  it("warns from 15 minutes on, rounding up to whole minutes", () => {
    expect(resolveSessionEndingNotice(15 * 60)?.title).toBe("Session ends in 15 min");
    expect(resolveSessionEndingNotice(13 * 60 + 1)?.title).toBe("Session ends in 14 min");
  });

  it("says what happens to the work", () => {
    expect(resolveSessionEndingNotice(14 * 60)?.description).toBe(
      "Work is saved — you can continue in a new session.",
    );
  });

  it("does not claim minutes below one", () => {
    expect(resolveSessionEndingNotice(30)?.title).toBe("Session ends in under a minute");
  });

  it("has nothing to say once the time is up: the ended state takes over", () => {
    expect(resolveSessionEndingNotice(0)).toBeNull();
  });
});

describe("sessionEndsAtMs", () => {
  const startedAt = "2026-10-24T08:00:00Z";
  const startedMs = Date.parse(startedAt);

  it("ends the hold where the record says: start + elapsed + remaining", () => {
    const session = { startedAt, elapsedSeconds: 3600, remainingSeconds: 1800 };
    expect(sessionEndsAtMs(session)).toBe(startedMs + 5400 * 1000);
  });

  it("is the same instant however stale the record is", () => {
    const early = sessionEndsAtMs({ startedAt, elapsedSeconds: 60, remainingSeconds: 5340 });
    const late = sessionEndsAtMs({ startedAt, elapsedSeconds: 3000, remainingSeconds: 2400 });
    expect(early).toBe(late);
  });

  it("is unknown when the server could not say, or the session has no start", () => {
    expect(sessionEndsAtMs({ startedAt, elapsedSeconds: 60, remainingSeconds: null })).toBeNull();
    expect(sessionEndsAtMs({ elapsedSeconds: 60, remainingSeconds: 600 })).toBeNull();
    expect(
      sessionEndsAtMs({ startedAt: "nope", elapsedSeconds: 60, remainingSeconds: 600 }),
    ).toBeNull();
  });
});

describe("secondsUntil", () => {
  it("counts down to the end and stops at zero", () => {
    expect(secondsUntil(1_000_000 + 90_000, 1_000_000)).toBe(90);
    expect(secondsUntil(1_000_000, 1_000_000 + 60_000)).toBe(0);
  });
});
