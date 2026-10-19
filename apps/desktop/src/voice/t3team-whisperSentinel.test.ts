import { describe, expect, it } from "vite-plus/test";

import {
  SENTINEL_MAX_HISTORY,
  appendAttempt,
  evaluateSentinel,
  parseSentinel,
} from "./t3team-whisperSentinel.ts";

const HOUR = 60 * 60 * 1000;

describe("whisper crash sentinel", () => {
  it("is open with no history and blocked inside the retry window", () => {
    expect(evaluateSentinel([], 1_000, HOUR)).toEqual({
      blocked: false,
      retryAtMs: null,
      crashCount: 0,
    });
    expect(evaluateSentinel([1_000], 1_000 + HOUR / 2, HOUR)).toEqual({
      blocked: true,
      retryAtMs: 1_000 + HOUR,
      crashCount: 1,
    });
  });

  it("allows one retry once the window has passed", () => {
    expect(evaluateSentinel([1_000], 1_000 + HOUR, HOUR).blocked).toBe(false);
  });

  it("keeps a bounded, sorted history and ignores garbage lines", () => {
    let content: string | null = "not a date";
    for (let attempt = 0; attempt < SENTINEL_MAX_HISTORY + 5; attempt += 1) {
      content = appendAttempt(content, 1_000_000 + attempt * 1_000);
    }
    const parsed = parseSentinel(content);
    expect(parsed).toHaveLength(SENTINEL_MAX_HISTORY);
    expect(parsed).toEqual(parsed.toSorted((a, b) => a - b));
    expect(Math.max(...parsed)).toBe(1_000_000 + (SENTINEL_MAX_HISTORY + 4) * 1_000);
  });
});
