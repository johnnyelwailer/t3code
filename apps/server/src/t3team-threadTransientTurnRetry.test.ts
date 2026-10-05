import { describe, expect, it } from "vite-plus/test";

import { MessageId, RunId } from "@t3tools/contracts";

import {
  MAX_SESSION_TRANSIENT_RETRIES,
  transientRetryExhaustedText,
  transientRetryInFlightText,
  transientTurnRetryBackoffMs,
  transientTurnRetryDelayMs,
  transientTurnReasonText,
  truncateStopReason,
} from "./t3team-threadTransientTurnRetryPolicy.ts";
import {
  planTransientRetry,
  priorRetryAttempts,
  transientRetryMessageId,
} from "./t3team-threadTransientTurnRetryPlan.ts";
import { retryDirectiveSeconds } from "./provider/Layers/t3team-claude-gateway-retry.ts";

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
    expect(transientRetryInFlightText(1, "Provider stream stalled", 15_000)).toBe(
      `Retrying (1/${MAX_SESSION_TRANSIENT_RETRIES}) — Provider stream stalled, next attempt in ~15s`,
    );
    expect(transientRetryExhaustedText("423 GPU reservation")).toBe(
      `423 GPU reservation — automatic retries exhausted (${MAX_SESSION_TRANSIENT_RETRIES} attempts)`,
    );
  });

  it("truncates long provider reasons and flattens whitespace", () => {
    const truncated = truncateStopReason("a\n\t b ".padEnd(400, "x"));
    expect(truncated.length).toBe(300);
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated).not.toContain("  ");
  });
});

const run = (id: string, ordinal: number, userMessageId: string) => ({
  id: RunId.make(id),
  ordinal,
  userMessageId: MessageId.make(userMessageId),
});

describe("priorRetryAttempts (durable episode count)", () => {
  it("counts the consecutive retry runs that led to the failed run", () => {
    const runs = [
      run("r1", 1, "user-1"),
      run("r2", 2, transientRetryMessageId(RunId.make("r1"))),
      run("r3", 3, transientRetryMessageId(RunId.make("r2"))),
    ];
    expect(priorRetryAttempts(runs, RunId.make("r1"))).toBe(0);
    expect(priorRetryAttempts(runs, RunId.make("r3"))).toBe(2);
  });

  it("restarts the count after a user message breaks the chain", () => {
    const runs = [
      run("r1", 1, "user-1"),
      run("r2", 2, transientRetryMessageId(RunId.make("r1"))),
      run("r3", 3, "user-2"),
      run("r4", 4, transientRetryMessageId(RunId.make("r3"))),
    ];
    expect(priorRetryAttempts(runs, RunId.make("r4"))).toBe(1);
    expect(priorRetryAttempts(runs, RunId.make("unknown"))).toBe(0);
  });
});

describe("planTransientRetry", () => {
  const failure = { message: "HTTP 503 service unavailable", directiveSeconds: null };
  const delayMs = (attempt: number) => attempt * 1_000;

  it("schedules the next attempt with the ladder delay and an in-flight note", () => {
    expect(
      planTransientRetry({
        runs: [run("r1", 1, "u")],
        failedRunId: RunId.make("r1"),
        failure,
        delayMs,
      }),
    ).toEqual({
      kind: "retry",
      attempt: 1,
      delayMs: 1_000,
      note: `Retrying (1/${MAX_SESSION_TRANSIENT_RETRIES}) — HTTP 503 service unavailable, next attempt in ~1s`,
    });
  });

  it("reports exhaustion once the budget is spent", () => {
    const runs = [
      run("r1", 1, "u"),
      run("r2", 2, transientRetryMessageId(RunId.make("r1"))),
      run("r3", 3, transientRetryMessageId(RunId.make("r2"))),
      run("r4", 4, transientRetryMessageId(RunId.make("r3"))),
    ];
    expect(planTransientRetry({ runs, failedRunId: RunId.make("r4"), failure, delayMs })).toEqual({
      kind: "exhausted",
      note: transientRetryExhaustedText("HTTP 503 service unavailable"),
    });
  });
});
