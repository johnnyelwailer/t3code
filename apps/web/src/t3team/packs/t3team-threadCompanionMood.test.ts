import { describe, expect, it } from "vite-plus/test";

import { threadCompanionMood } from "./t3team-threadCompanionMood";

describe("threadCompanionMood", () => {
  it.each([
    [true, "running", "thinking"],
    [true, "completed", "thinking"],
    [false, "completed", "success"],
    [false, "failed", "error"],
    [false, "interrupted", "newThread"],
    [false, "cancelled", "newThread"],
    [false, null, "newThread"],
    [false, undefined, "newThread"],
  ] as const)("working=%s, latest run %s -> %s", (working, latestRunStatus, mood) => {
    expect(threadCompanionMood({ working, latestRunStatus })).toBe(mood);
  });
});
