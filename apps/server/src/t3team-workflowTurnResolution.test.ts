/**
 * The turn-watch rules, unit-level. The integration proof (real engine + reactor) lives in
 * `t3team-workflowEngineTurnAnswer.integration.test.ts`; here we pin the decisions that proof
 * cannot show one at a time.
 */

import { describe, expect, it } from "vite-plus/test";

import {
  createWorkflowTurnTracker,
  UNKNOWN_TURN_FAILURE,
} from "./t3team-workflowTurnResolution.ts";

const THREAD = "thread-1";
const ASK = "run-1:3";
const running = { status: "running", activeTurnId: "turn-1" } as const;
const idle = { status: "ready", activeTurnId: null } as const;

describe("workflow turn tracker", () => {
  it("hands back the text it retained, so the caller can attribute that message", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.appendDelta(THREAD, ASK, "m1", "the answer");
    // The retained text is returned — the reactor stamps THIS message with the step's author.
    expect(tracker.completeMessage(THREAD, ASK, "m1", "")).toBe("the answer");
    // Nothing substantive to attribute.
    expect(tracker.completeMessage(THREAD, ASK, "m2", "")).toBeUndefined();
    tracker.appendDelta(THREAD, ASK, "m3", "   \n ");
    expect(tracker.completeMessage(THREAD, ASK, "m3", "")).toBeUndefined();
  });

  it("answers with the LAST substantive message of the turn", () => {
    const tracker = createWorkflowTurnTracker();
    expect(tracker.noteSession(THREAD, ASK, running)).toBe("running");
    tracker.appendDelta(THREAD, ASK, "m1", "I will fetch the context first.");
    tracker.completeMessage(THREAD, ASK, "m1", "");
    tracker.appendDelta(THREAD, ASK, "m2", "## Goal\n");
    tracker.appendDelta(THREAD, ASK, "m2", "Round to two decimals.");
    tracker.completeMessage(THREAD, ASK, "m2", "");
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("ended");
    expect(tracker.take(THREAD, ASK)).toEqual({
      kind: "answer",
      text: "## Goal\nRound to two decimals.",
    });
  });

  it("ignores the idle session write that lands before the turn ever starts", () => {
    const tracker = createWorkflowTurnTracker();
    // `session.started` right after the workflow dispatched its turn: no turn ran yet, so this
    // must NOT settle the ask (it would resolve every agent step with nothing).
    expect(tracker.noteSession(THREAD, ASK, { status: "ready", activeTurnId: null })).toBe(
      "pending",
    );
    expect(tracker.noteSession(THREAD, ASK, running)).toBe("running");
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("ended");
  });

  it("arms the settle only once per turn", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("ended");
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("settling");
  });

  it("reports an empty turn instead of inventing an answer", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    // A closed message with no text at all, and a whitespace-only one: neither is an answer.
    tracker.completeMessage(THREAD, ASK, "m1", "");
    tracker.appendDelta(THREAD, ASK, "m2", "   \n ");
    tracker.completeMessage(THREAD, ASK, "m2", "");
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("ended");
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "empty" });
  });

  it("ends the wait when the session dies without ever running the turn — as a failure", () => {
    const tracker = createWorkflowTurnTracker();
    expect(tracker.noteSession(THREAD, ASK, { status: "error", activeTurnId: null })).toBe("ended");
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "failed", error: UNKNOWN_TURN_FAILURE });
  });

  it("ends the wait when a runtime error leaves the dead turn's id on the session", () => {
    // `runtime.error` ingestion writes status `error` with `activeTurnId` still set; an errored
    // session cannot be answering, so this is a failure, not a running turn.
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    expect(
      tracker.noteSession(THREAD, ASK, {
        status: "error",
        activeTurnId: "turn-1",
        lastError: "provider crashed",
      }),
    ).toBe("ended");
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "failed", error: "provider crashed" });
  });

  it("settles a turn whose session died as failed with the provider's reason, never its preamble", () => {
    // GHE #403: the driver's retry ladder exhausted after hours; the turn ended with `error`. The
    // "I'll start by…" it streamed first is not the answer, and the reason must be the gateway's.
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    tracker.appendDelta(THREAD, ASK, "m1", "I'll pick the next task first.");
    tracker.completeMessage(THREAD, ASK, "m1", "");
    expect(
      tracker.noteSession(THREAD, ASK, {
        status: "error",
        activeTurnId: null,
        lastError: "Request timed out",
      }),
    ).toBe("ended");
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "failed", error: "Request timed out" });
  });

  it("does not let a later session error discard an answer the turn already gave", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    tracker.appendDelta(THREAD, ASK, "m1", "done");
    tracker.completeMessage(THREAD, ASK, "m1", "");
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("ended");
    // The session dies AFTER the turn ended and answered — settling, not a new verdict.
    expect(
      tracker.noteSession(THREAD, ASK, {
        status: "error",
        activeTurnId: null,
        lastError: "connection reset",
      }),
    ).toBe("settling");
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "answer", text: "done" });
  });

  it("treats a stopped session like before: no answer is empty, not failed", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    expect(tracker.noteSession(THREAD, ASK, { status: "stopped", activeTurnId: null })).toBe(
      "ended",
    );
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "empty" });
  });

  it("ends the wait for a turn that answered even if no active session was observed", () => {
    // A run rehydrated mid-turn after a restart never saw its `turn.started`; the messages plus an
    // idle session are enough.
    const tracker = createWorkflowTurnTracker();
    tracker.appendDelta(THREAD, ASK, "m1", "done");
    tracker.completeMessage(THREAD, ASK, "m1", "");
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("ended");
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "answer", text: "done" });
  });

  it("takes the straggler that lands after the turn-end signal", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    tracker.appendDelta(THREAD, ASK, "m1", "thinking");
    tracker.completeMessage(THREAD, ASK, "m1", "");
    expect(tracker.noteSession(THREAD, ASK, idle)).toBe("ended");
    // `ProviderRuntimeIngestion` flushes a message the provider left unclosed AFTER it publishes
    // the idle session; the settle grace window is what lets it be the answer.
    tracker.appendDelta(THREAD, ASK, "m2", "the real answer");
    tracker.completeMessage(THREAD, ASK, "m2", "");
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "answer", text: "the real answer" });
  });

  it("never leaks one turn's text into the next ask on the same thread", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    tracker.appendDelta(THREAD, ASK, "m1", "first turn");
    tracker.completeMessage(THREAD, ASK, "m1", "");
    const second = "run-1:7";
    tracker.noteSession(THREAD, second, running);
    expect(tracker.noteSession(THREAD, second, idle)).toBe("ended");
    expect(tracker.take(THREAD, second)).toEqual({ kind: "empty" });
    // And the settled/forgotten watch cannot be taken by the older ask.
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "stale" });
  });

  it("treats a take for a different ask, or after forget, as stale", () => {
    const tracker = createWorkflowTurnTracker();
    tracker.noteSession(THREAD, ASK, running);
    tracker.noteSession(THREAD, ASK, idle);
    tracker.forget(THREAD);
    expect(tracker.take(THREAD, ASK)).toEqual({ kind: "stale" });
  });
});
