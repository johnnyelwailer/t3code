import { describe, expect, it } from "vite-plus/test";

import {
  classifyTransientTurnFailure,
  createTransientTurnRetryTracker,
  MAX_SESSION_TRANSIENT_RETRIES,
  readWatchdogStallWarning,
  transientRetryExhaustedText,
  transientRetryInFlightText,
  transientTurnRetryBackoffMs,
  transientTurnRetryDelayMs,
  transientTurnReasonText,
  truncateStopReason,
  watchdogStallReason,
} from "./t3team-threadTransientTurnRetry.ts";
import { retryDirectiveSeconds } from "./provider/Layers/claude-gateway-retry.ts";

describe("transientTurnRetryDelayMs", () => {
  it("honors a gateway retry_after_seconds directive with a small cushion", () => {
    // random=()=>0 → exactly the 5% lower cushion: 12s * 1.05 = 12.6s.
    expect(transientTurnRetryDelayMs(1, 12, undefined, () => 0)).toBe(12_600);
  });

  it("caps a bogus long directive at 60s (with cushion)", () => {
    // random=()=>0 → 60s * 1.05 = 63s.
    expect(transientTurnRetryDelayMs(1, 3000, undefined, () => 0)).toBe(63_000);
  });

  it("falls back to the backoff ladder when no directive is present", () => {
    expect(transientTurnRetryDelayMs(1, null)).toBe(15_000);
    expect(transientTurnRetryDelayMs(2, null)).toBe(30_000);
    expect(transientTurnRetryDelayMs(3, null)).toBe(60_000);
  });

  it("lets the env override win over a directive (e2e knob)", () => {
    expect(transientTurnRetryDelayMs(1, 120, 2_000)).toBe(2_000);
    expect(transientTurnRetryDelayMs(1, 120, 999_999)).toBe(120_000);
  });

  it("parses the directive out of reservation error text (shared with the in-turn policy)", () => {
    expect(
      retryDirectiveSeconds(
        '423 {"type":"reservation_error","code":"gpu_reserved","retry_after_seconds":45}',
      ),
    ).toBe(45);
    expect(retryDirectiveSeconds("http status 503: service unavailable")).toBeNull();
  });
});

describe("transientTurnReasonText", () => {
  it("summarizes the reservation class deterministically", () => {
    expect(
      transientTurnReasonText(
        '423: {"type":"reservation_error","code":"gpu_reserved","retry_after_seconds":45} Reservation owner is currently using the GPU; retry shortly',
      ),
    ).toBe("423 — GPU reserved by current owner");
  });

  it("keeps other transient reasons verbatim (truncated)", () => {
    expect(transientTurnReasonText("Gateway returned 503: service unavailable")).toBe(
      "Gateway returned 503: service unavailable",
    );
  });
});

describe("transientTurnRetryBackoffMs", () => {
  it("uses the default ladder, clamped to the last step", () => {
    expect(transientTurnRetryBackoffMs(1)).toBe(15_000);
    expect(transientTurnRetryBackoffMs(2)).toBe(30_000);
    expect(transientTurnRetryBackoffMs(3)).toBe(60_000);
    expect(transientTurnRetryBackoffMs(4)).toBe(60_000);
    expect(transientTurnRetryBackoffMs(0)).toBe(15_000);
  });

  it("honors a positive finite override, capped, and ignores invalid values", () => {
    expect(transientTurnRetryBackoffMs(1, 500)).toBe(500);
    expect(transientTurnRetryBackoffMs(1, 999_999)).toBe(120_000);
    expect(transientTurnRetryBackoffMs(1, 0)).toBe(15_000);
    expect(transientTurnRetryBackoffMs(1, -1)).toBe(15_000);
    expect(transientTurnRetryBackoffMs(1, Number.NaN)).toBe(15_000);
  });
});

describe("reason text helpers", () => {
  it("formats the in-flight and exhausted stop reasons", () => {
    expect(transientRetryInFlightText(1, "Provider stream stalled (no activity for 600s)")).toBe(
      `Retrying (1/${MAX_SESSION_TRANSIENT_RETRIES}) — Provider stream stalled (no activity for 600s)`,
    );
    expect(transientRetryExhaustedText("423 GPU reservation")).toBe(
      `423 GPU reservation — automatic retries exhausted (${MAX_SESSION_TRANSIENT_RETRIES} attempts)`,
    );
    expect(watchdogStallReason(600)).toBe("Provider stream stalled (no activity for 600s)");
  });

  it("truncates long provider reasons and flattens whitespace", () => {
    const truncated = truncateStopReason("a\n\t b ".padEnd(400, "x"));
    expect(truncated.length).toBe(300);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated).not.toContain("  ");
  });
});

describe("readWatchdogStallWarning", () => {
  it("reads the host watchdog detail and ignores everything else", () => {
    expect(
      readWatchdogStallWarning({ detail: { code: "turn.inactivity", inactivitySeconds: 600 } }),
    ).toEqual({
      inactivitySeconds: 600,
    });
    expect(
      readWatchdogStallWarning({ detail: { code: "provider.gateway_retry", attempt: 1 } }),
    ).toBeNull();
    expect(readWatchdogStallWarning({})).toBeNull();
    expect(
      readWatchdogStallWarning({ detail: { code: "turn.inactivity", inactivitySeconds: -5 } }),
    ).toBeNull();
  });
});

describe("classifyTransientTurnFailure", () => {
  it("classifies the observed 423 GPU reservation text transient", () => {
    const result = classifyTransientTurnFailure({
      state: "failed",
      errorMessage: "423: Reservation owner is currently using the GPU; retry shortly",
    });
    expect(result?.reason).toContain("423");
  });

  it("classifies 429/5xx and retry directives transient", () => {
    expect(
      classifyTransientTurnFailure({
        state: "failed",
        errorMessage: 'Request failed with status 429: {"type":"rate_limit_error"}',
      })?.reason,
    ).toContain("429");
    expect(
      classifyTransientTurnFailure({
        state: "failed",
        errorMessage: "503 service unavailable",
      })?.reason,
    ).toContain("503");
  });

  it("never classifies auth/permanent errors transient", () => {
    expect(
      classifyTransientTurnFailure({ state: "failed", errorMessage: "401: invalid API key" }),
    ).toBeNull();
    expect(
      classifyTransientTurnFailure({ state: "failed", errorMessage: "Max turns reached" }),
    ).toBeNull();
    expect(classifyTransientTurnFailure({ state: "completed", errorMessage: "429" })).toBeNull();
    // A line-number mention of 423 in an ordinary error is not a capacity code.
    expect(
      classifyTransientTurnFailure({
        state: "failed",
        errorMessage: "SyntaxError at /app/src/x.ts:423",
      }),
    ).toBeNull();
  });
});

describe("createTransientTurnRetryTracker — retry policy", () => {
  const stallWarning = {
    type: "runtime.warning",
    payload: {
      message: "Turn stalled",
      detail: { code: "turn.inactivity", inactivitySeconds: 600 },
    },
  } as const;

  it("retries a watchdog stall up to the bound, then reports exhaustion", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";

    tracker.onStallWarning(threadId, "turn-1", stallWarning.payload);
    const d1 = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.aborted",
      payload: { reason: "This operation was aborted" },
    });
    expect(d1).toMatchObject({
      kind: "retry",
      attempt: 1,
      reason: "Provider stream stalled (no activity for 600s)",
      delayMs: 15_000,
    });
    expect((d1 as { inFlightText?: string }).inFlightText).toContain("Retrying (1/");
    expect((d1 as { inFlightText?: string }).inFlightText).not.toContain("next attempt in");

    tracker.onTurnStarted(threadId); // the auto-retry turn starts
    tracker.onStallWarning(threadId, "turn-2", stallWarning.payload);
    const d2 = tracker.onTurnTerminal(threadId, "turn-2", {
      type: "turn.completed",
      payload: { state: "interrupted", stopReason: "This operation was aborted" },
    });
    expect(d2).toMatchObject({ kind: "retry", attempt: 2 });

    tracker.onTurnStarted(threadId);
    tracker.onStallWarning(threadId, "turn-3", stallWarning.payload);
    const d3 = tracker.onTurnTerminal(threadId, "turn-3", {
      type: "turn.aborted",
      payload: { reason: "This operation was aborted" },
    });
    expect(d3).toMatchObject({ kind: "retry", attempt: 3 });

    tracker.onTurnStarted(threadId);
    tracker.onStallWarning(threadId, "turn-4", stallWarning.payload);
    const d4 = tracker.onTurnTerminal(threadId, "turn-4", {
      type: "turn.aborted",
      payload: { reason: "This operation was aborted" },
    });
    expect(d4).toMatchObject({
      kind: "exhausted",
      exhaustedText:
        "Provider stream stalled (no activity for 600s) — automatic retries exhausted (3 attempts)",
    });
  });

  it("retries a transient gateway turn failure (423) with the provider's text as reason", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    const decision = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.completed",
      payload: {
        state: "failed",
        errorMessage: "423: Reservation owner is currently using the GPU; retry shortly",
      },
    });
    expect(decision).toMatchObject({ kind: "retry", attempt: 1, delayMs: 15_000 });
    expect((decision as { inFlightText?: string }).inFlightText).toContain("423");
  });

  it("schedules a reservation retry at the directive expiry and advertises the wait", () => {
    const tracker = createTransientTurnRetryTracker({
      delayMs: (attempt, _reason, directiveSeconds) =>
        transientTurnRetryDelayMs(attempt, directiveSeconds, undefined, () => 0),
    });
    const threadId = "thread-res";
    const decision = tracker.onTurnTerminal(threadId, undefined, {
      type: "turn.completed",
      payload: {
        state: "failed",
        errorMessage:
          '423: {"type":"reservation_error","code":"gpu_reserved","retry_after_seconds":12} Reservation owner is currently using the GPU; retry shortly',
      },
    });
    // 12s directive + 5% cushion; reason summarized; wait advertised.
    expect(decision).toMatchObject({
      kind: "retry",
      attempt: 1,
      reason: "423 — GPU reserved by current owner",
      delayMs: 12_600,
    });
    expect((decision as { inFlightText?: string }).inFlightText).toBe(
      "Retrying (1/3) — 423 — GPU reserved by current owner, next attempt in ~13s",
    );
  });

  it("does NOT retry a non-transient failure (auth) and clears the episode", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    const decision = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.completed",
      payload: { state: "failed", errorMessage: "401: invalid API key" },
    });
    expect(decision).toBeUndefined();
    // Episode cleared: a later stall still gets the full budget.
    tracker.onTurnStarted(threadId);
    tracker.onStallWarning(threadId, "turn-2", stallWarning.payload);
    const d = tracker.onTurnTerminal(threadId, "turn-2", {
      type: "turn.aborted",
      payload: { reason: "aborted" },
    });
    expect(d).toMatchObject({ kind: "retry", attempt: 1 });
  });

  it("succeeding turn ends the episode and resets the budget", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    tracker.onStallWarning(threadId, "turn-1", stallWarning.payload);
    const d1 = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.aborted",
      payload: { reason: "aborted" },
    });
    expect(d1).toMatchObject({ kind: "retry", attempt: 1 });
    tracker.onTurnStarted(threadId);
    tracker.onTurnTerminal(threadId, "turn-2", {
      type: "turn.completed",
      payload: { state: "completed" },
    });
    tracker.onStallWarning(threadId, "turn-3", stallWarning.payload);
    const d2 = tracker.onTurnTerminal(threadId, "turn-3", {
      type: "turn.aborted",
      payload: { reason: "aborted" },
    });
    expect(d2).toMatchObject({ kind: "retry", attempt: 1 });
  });

  it("keeps the scheduled retry when session.exited follows a transient death", () => {
    // Live observed sequence: runtime.warning(stall) → turn.completed
    // (state interrupted) → session.exited, milliseconds apart. The session
    // exit is part of the SAME death; the re-issue starts a fresh session,
    // so the episode bookkeeping must survive it (otherwise the re-validate
    // guard sees attempts reset and bails, dead-ending the thread).
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    tracker.onTurnStarted(threadId);
    tracker.onStallWarning(threadId, "turn-1", stallWarning.payload);
    const decision = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.completed",
      payload: { state: "interrupted", stopReason: "Session stopped." },
    });
    expect(decision).toMatchObject({ kind: "retry", attempt: 1 });
    tracker.onTurnTerminal(threadId, "turn-1", { type: "session.exited", payload: {} });
    expect(tracker.state.get(threadId)?.attempts).toBe(1);
    expect(tracker.state.get(threadId)?.lastTerminal).toBe("transient");
  });

  it("clears the episode on session.exited after a non-transient death", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    tracker.onTurnStarted(threadId);
    tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.completed",
      payload: { state: "failed", errorMessage: "401: invalid x-api-key" },
    });
    tracker.onTurnTerminal(threadId, "turn-1", { type: "session.exited", payload: {} });
    expect(tracker.state.get(threadId)).toBeUndefined();
  });

  it("retries a Claude-style watchdog stall: turn.completed state 'interrupted'", () => {
    // The Claude adapter ends a watchdog-interrupted turn with a turn.completed
    // (state "interrupted"), not a turn.aborted — the stall marker must apply
    // to both terminal shapes.
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    tracker.onStallWarning(threadId, "turn-1", stallWarning.payload);
    const decision = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.completed",
      payload: { state: "interrupted", stopReason: "This operation was aborted" },
    });
    expect(decision).toMatchObject({
      kind: "retry",
      attempt: 1,
      reason: "Provider stream stalled (no activity for 600s)",
    });
  });

  it("persists a reason for provider-side aborts without retrying", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    const decision = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.aborted",
      payload: { reason: "Provider process exited unexpectedly" },
    });
    expect(decision).toEqual({
      kind: "persist-reason",
      reason: "Provider process exited unexpectedly",
    });
  });
});

describe("createTransientTurnRetryTracker — user-stop protection (no-resurrect)", () => {
  it("never retries a user-stopped turn, even if the watchdog marker raced in", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    // Watchdog fires in the same window the user hits stop (marker already armed).
    tracker.onStallWarning(threadId, "turn-1", {
      detail: { code: "turn.inactivity", inactivitySeconds: 600 },
    });
    tracker.onInterruptRequested(threadId);
    const decision = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.aborted",
      payload: { reason: "interrupted" },
    });
    expect(decision).toBeUndefined();
    // The stall marker was consumed: nothing lingers for the next turn.
    expect(tracker.state.get(threadId)?.stall).toBeNull();
  });

  it("does not resurrect a cascaded stop", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "child-thread";
    tracker.onInterruptRequested(threadId);
    const decision = tracker.onTurnTerminal(threadId, "turn-9", {
      type: "turn.aborted",
      payload: { reason: "interrupted by parent" },
    });
    expect(decision).toBeUndefined();
  });

  it("does not retry an interrupted result after a user stop", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    tracker.onInterruptRequested(threadId);
    const decision = tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.completed",
      payload: { state: "interrupted", stopReason: "interrupted" },
    });
    expect(decision).toBeUndefined();
  });

  it("a new user message resets the episode", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    tracker.onStallWarning(threadId, "turn-1", {
      detail: { code: "turn.inactivity", inactivitySeconds: 600 },
    });
    tracker.onTurnTerminal(threadId, "turn-1", {
      type: "turn.aborted",
      payload: { reason: "aborted" },
    });
    tracker.onUserMessage(threadId);
    tracker.onStallWarning(threadId, "turn-2", {
      detail: { code: "turn.inactivity", inactivitySeconds: 600 },
    });
    const decision = tracker.onTurnTerminal(threadId, "turn-2", {
      type: "turn.aborted",
      payload: { reason: "aborted" },
    });
    expect(decision).toMatchObject({ kind: "retry", attempt: 1 });
  });

  it("session exit clears all bookkeeping", () => {
    const tracker = createTransientTurnRetryTracker();
    const threadId = "thread-1";
    tracker.onStallWarning(threadId, "turn-1", {
      detail: { code: "turn.inactivity", inactivitySeconds: 600 },
    });
    tracker.onTurnTerminal(threadId, "turn-1", { type: "session.exited", payload: {} });
    expect(tracker.state.get(threadId)).toBeUndefined();
  });
});
