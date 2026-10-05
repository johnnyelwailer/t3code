import { assert, describe, it } from "@effect/vitest";

import {
  AUTO_PAUSE_COOLDOWN_MS,
  admitTurn,
  autoPauseView,
  escalationNote,
  INITIAL_AUTO_PAUSE,
  observeLevel,
  takeTurnNote,
  type AutoPauseState,
} from "./t3team-resourcePressureAutoPauseModel.ts";

const observe = (state: AutoPauseState, level: "ok" | "warn" | "critical", nowMs: number) =>
  observeLevel(state, level, nowMs);

describe("auto-pause state machine", () => {
  it("pause → hold → cooldown → resume → exactly one note", () => {
    let state = observe(INITIAL_AUTO_PAUSE, "critical", 0).state;
    assert.strictEqual(state.phase, "pausing");

    // Turn boundary while critical: held, first hold marks the thread paused.
    const first = admitTurn(state, "t1", 1_000);
    assert.deepStrictEqual([first.hold, first.firstHold], [true, true]);
    const second = admitTurn(first.state, "t1", 2_000);
    assert.deepStrictEqual([second.hold, second.firstHold], [true, false]);
    state = second.state;
    assert.deepStrictEqual(autoPauseView(state).threads, [
      { threadId: "t1", pausedAt: 1_000, heldTurnCount: 2 },
    ]);

    // Below critical: cooldown starts; the paused thread keeps holding, others start.
    state = observe(state, "warn", 10_000).state;
    assert.strictEqual(state.phase, "cooldown");
    assert.strictEqual(autoPauseView(state).resumesAt, 10_000 + AUTO_PAUSE_COOLDOWN_MS);
    assert.isTrue(admitTurn(state, "t1", 11_000).hold);
    assert.isFalse(admitTurn(state, "other", 11_000).hold);

    // Not yet: the cooldown window has not elapsed.
    const early = observe(state, "warn", 10_000 + AUTO_PAUSE_COOLDOWN_MS - 1);
    assert.deepStrictEqual(early.resumed, []);

    const resumed = observe(early.state, "ok", 10_000 + AUTO_PAUSE_COOLDOWN_MS);
    assert.deepStrictEqual(resumed.resumed, [
      { threadId: "t1", pausedMs: 69_000, heldTurnCount: 2 },
    ]);
    state = resumed.state;
    assert.strictEqual(state.phase, "running");
    assert.deepStrictEqual(autoPauseView(state).threads, []);

    const note = takeTurnNote(state, "t1");
    assert.strictEqual(note.note, "Paused 69 s for memory pressure; current level ok.");
    assert.strictEqual(takeTurnNote(note.state, "t1").note, null, "never a second note");
  });

  it("critical during cooldown restarts the cooldown instead of resuming", () => {
    let state = admitTurn(observe(INITIAL_AUTO_PAUSE, "critical", 0).state, "t1", 0).state;
    state = observe(state, "warn", 5_000).state;
    state = observe(state, "critical", 30_000).state;
    assert.strictEqual(state.phase, "pausing");
    state = observe(state, "warn", 40_000).state;
    const stillHeld = observe(state, "ok", 40_000 + AUTO_PAUSE_COOLDOWN_MS - 1);
    assert.deepStrictEqual(stillHeld.resumed, []);
    assert.strictEqual(
      observe(stillHeld.state, "ok", 40_000 + AUTO_PAUSE_COOLDOWN_MS).resumed.length,
      1,
    );
  });

  it("escalation note fires once per escalation; de-escalation does not repeat it", () => {
    let state = observe(INITIAL_AUTO_PAUSE, "warn", 0).state;
    assert.isFalse(admitTurn(state, "t1", 0).hold, "warn never holds");
    const first = takeTurnNote(state, "t1");
    assert.strictEqual(first.note, escalationNote("warn"));
    assert.strictEqual(takeTurnNote(first.state, "t1").note, null);
    // Other threads with an upcoming turn get their own one note.
    assert.strictEqual(takeTurnNote(first.state, "t2").note, escalationNote("warn"));
    // Back to ok, and a same-level sample: nothing new to say.
    state = observe(observe(first.state, "ok", 1).state, "ok", 2).state;
    assert.strictEqual(takeTurnNote(state, "t1").note, null);
    // A fresh escalation is a new episode.
    state = observe(state, "warn", 3).state;
    assert.strictEqual(takeTurnNote(state, "t1").note, escalationNote("warn"));
  });

  it("a resumed thread gets the resume note, not an extra escalation note", () => {
    let state = observe(INITIAL_AUTO_PAUSE, "critical", 0).state;
    state = admitTurn(state, "t1", 0).state;
    state = observe(state, "warn", 1).state;
    state = observe(state, "warn", 1 + AUTO_PAUSE_COOLDOWN_MS).state;
    const note = takeTurnNote(state, "t1");
    assert.include(note.note ?? "", "Paused");
    assert.strictEqual(takeTurnNote(note.state, "t1").note, null);
  });

  it("a new escalation before the resumed thread's next turn replaces the stale resume note", () => {
    let state = admitTurn(observe(INITIAL_AUTO_PAUSE, "critical", 0).state, "t1", 0).state;
    state = observe(state, "ok", 1).state;
    state = observe(state, "ok", 1 + AUTO_PAUSE_COOLDOWN_MS).state;
    state = observe(state, "warn", 2 + AUTO_PAUSE_COOLDOWN_MS).state;
    const note = takeTurnNote(state, "t1");
    assert.strictEqual(note.note, escalationNote("warn"));
    assert.strictEqual(takeTurnNote(note.state, "t1").note, null);
  });
});
