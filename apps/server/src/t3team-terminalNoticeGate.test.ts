import { describe, expect, it } from "@effect/vitest";

import {
  makeTerminalNoticeGate,
  TERMINAL_NOTICE_QUIET_MS_DEFAULT,
  type TerminalNoticeEpisode,
} from "./t3team-terminalNoticeGate.ts";

/**
 * Deterministic unit tests for the canonical terminal-notice coalescing gate.
 * The clock is injected (no real timers), so every assertion is a pure
 * function of the fake `now` value.
 *
 * @module t3team-terminalNoticeGate.test
 */
describe("makeTerminalNoticeGate", () => {
  it("allows the first delivery for an episode", () => {
    const gate = makeTerminalNoticeGate({ nowMs: () => 1_000 });
    const ep: TerminalNoticeEpisode = { recipientThreadId: "p", kind: "terminal", episodeId: "c" };
    expect(gate.allow(ep)).toBe(true);
  });

  it("suppresses a repeat within the quiet window", () => {
    let now = 1_000;
    const gate = makeTerminalNoticeGate({ nowMs: () => now, quietMs: 60_000 });
    const ep: TerminalNoticeEpisode = { recipientThreadId: "p", kind: "terminal", episodeId: "c" };
    expect(gate.allow(ep)).toBe(true);
    now += 30_000; // still inside the 60s window
    expect(gate.allow(ep)).toBe(false);
  });

  it("allows again once the quiet window elapses", () => {
    let now = 1_000;
    const gate = makeTerminalNoticeGate({ nowMs: () => now, quietMs: 60_000 });
    const ep: TerminalNoticeEpisode = { recipientThreadId: "p", kind: "terminal", episodeId: "c" };
    expect(gate.allow(ep)).toBe(true);
    now += 61_000; // beyond the 60s window
    expect(gate.allow(ep)).toBe(true);
  });

  it("keys on recipient, kind, and episode independently", () => {
    const gate = makeTerminalNoticeGate({ nowMs: () => 1_000, quietMs: 60_000 });
    const base: TerminalNoticeEpisode = { recipientThreadId: "p1", kind: "terminal", episodeId: "c" };
    expect(gate.allow(base)).toBe(true);
    // A different recipient is a distinct key.
    expect(gate.allow({ ...base, recipientThreadId: "p2" })).toBe(true);
    // A different notice kind is a distinct key.
    expect(gate.allow({ ...base, kind: "abnormal-stop" })).toBe(true);
    // A different episode is a distinct key.
    expect(gate.allow({ ...base, episodeId: "c2" })).toBe(true);
  });

  it("uses the default quiet window when none is supplied", () => {
    expect(TERMINAL_NOTICE_QUIET_MS_DEFAULT).toBeGreaterThan(0);
    let now = 1_000_000;
    const gate = makeTerminalNoticeGate({ nowMs: () => now });
    const ep: TerminalNoticeEpisode = { recipientThreadId: "p", kind: "completed", episodeId: "c" };
    expect(gate.allow(ep)).toBe(true);
    now += TERMINAL_NOTICE_QUIET_MS_DEFAULT - 1; // just under the window
    expect(gate.allow(ep)).toBe(false);
    now += 1; // just over the window
    expect(gate.allow(ep)).toBe(true);
  });

  it("reset clears all suppression state", () => {
    let now = 1_000;
    const gate = makeTerminalNoticeGate({ nowMs: () => now, quietMs: 60_000 });
    const ep: TerminalNoticeEpisode = { recipientThreadId: "p", kind: "terminal", episodeId: "c" };
    expect(gate.allow(ep)).toBe(true);
    gate.reset();
    now += 1_000; // would otherwise be suppressed
    expect(gate.allow(ep)).toBe(true);
  });
});
