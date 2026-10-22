import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  acquireFirstLoadSession,
  finishFirstLoadSession,
  HANDOFF_GRACE_MS,
  holdFirstLoadSession,
  markFirstLoadShown,
  MIN_VISIBLE_MS,
  releaseFirstLoadSession,
  resetFirstLoadSessionForTests,
  resolveFirstLoadPhase,
  REVEAL_DELAY_MS,
} from "~/t3team/t3team-myWorkFirstLoadReveal";

afterEach(() => resetFirstLoadSessionForTests());

describe("resolveFirstLoadPhase", () => {
  it("shows nothing inside the reveal delay, then the greeting", () => {
    expect(resolveFirstLoadPhase({ loading: true, now: 100, startedAt: 0, shownAt: null })).toEqual(
      { phase: "pending", wakeAt: REVEAL_DELAY_MS },
    );
    expect(
      resolveFirstLoadPhase({ loading: true, now: REVEAL_DELAY_MS, startedAt: 0, shownAt: null }),
    ).toEqual({ phase: "placeholder", wakeAt: null });
  });

  it("a load that beats the delay goes straight to content — no greeting at all", () => {
    expect(
      resolveFirstLoadPhase({ loading: false, now: 120, startedAt: 0, shownAt: null }).phase,
    ).toBe("content");
  });

  it("keeps a shown greeting for its minimum dwell, then releases it", () => {
    const shownAt = 300;
    expect(
      resolveFirstLoadPhase({ loading: false, now: shownAt + 100, startedAt: 0, shownAt }),
    ).toEqual({ phase: "placeholder", wakeAt: shownAt + MIN_VISIBLE_MS });
    expect(
      resolveFirstLoadPhase({
        loading: false,
        now: shownAt + MIN_VISIBLE_MS,
        startedAt: 0,
        shownAt,
      }).phase,
    ).toBe("content");
  });

  it("never releases a greeting while still loading", () => {
    expect(
      resolveFirstLoadPhase({ loading: true, now: 99_999, startedAt: 0, shownAt: 300 }).phase,
    ).toBe("placeholder");
  });
});

describe("first-load session", () => {
  it("is continued by a mount right after a hand-off (gate → My Work)", () => {
    const gate = acquireFirstLoadSession(0);
    holdFirstLoadSession(gate);
    markFirstLoadShown(gate, 260);
    releaseFirstLoadSession(gate, { completed: false, now: 500 });
    const myWork = acquireFirstLoadSession(500 + HANDOFF_GRACE_MS - 1);
    expect(myWork).toBe(gate);
    expect(myWork.shownAt).toBe(260);
  });

  it("starts fresh once the content was shown, or after the grace window", () => {
    const first = acquireFirstLoadSession(0);
    holdFirstLoadSession(first);
    releaseFirstLoadSession(first, { completed: true, now: 100 });
    const second = acquireFirstLoadSession(200);
    expect(second).not.toBe(first);
    holdFirstLoadSession(second);
    releaseFirstLoadSession(second, { completed: false, now: 300 });
    expect(acquireFirstLoadSession(300 + HANDOFF_GRACE_MS + 1)).not.toBe(second);
  });

  it("ends for everyone once any holder shows its content", () => {
    const session = acquireFirstLoadSession(0);
    holdFirstLoadSession(session);
    finishFirstLoadSession(session);
    expect(acquireFirstLoadSession(10)).not.toBe(session);
  });

  it("records only the first reveal", () => {
    const session = acquireFirstLoadSession(0);
    markFirstLoadShown(session, 260);
    markFirstLoadShown(session, 900);
    expect(session.shownAt).toBe(260);
  });
});
