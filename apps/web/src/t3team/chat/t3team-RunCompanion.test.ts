import { describe, expect, it } from "vite-plus/test";

import { runCompanionMood } from "./t3team-RunCompanion";

describe("runCompanionMood", () => {
  it.each([
    [true, false, "running", "thinking"],
    [true, true, "completed", "thinking"],
    [false, true, "completed", "success"],
    [false, true, "failed", "error"],
    [false, true, "interrupted", null],
    [false, true, "running", null],
    [false, false, "completed", null],
    [false, false, undefined, null],
  ] as const)(
    "working=%s finished=%s status=%s -> %s",
    (working, justFinished, latestRunStatus, mood) => {
      expect(runCompanionMood({ working, justFinished, latestRunStatus })).toBe(mood);
    },
  );
});
