import { describe, expect, it } from "vite-plus/test";

import { RunId } from "./baseSchemas.ts";
import { mergeTransientRecovery } from "./t3team-transientRecovery.ts";

const runA = RunId.make("run-a");
const runB = RunId.make("run-b");

describe("mergeTransientRecovery", () => {
  it("defaults auto-resume on for a newly armed run", () => {
    expect(
      mergeTransientRecovery(null, { runId: runA, nextTryAt: "2026-10-11T10:05:00.000Z" }),
    ).toEqual({
      runId: runA,
      nextTryAt: "2026-10-11T10:05:00.000Z",
      autoResume: true,
    });
  });

  it("keeps the user's choice when the host re-arms the same run, and its time on a toggle", () => {
    const off = mergeTransientRecovery(
      { runId: runA, nextTryAt: "2026-10-11T10:05:00.000Z", autoResume: true },
      { runId: runA, autoResume: false },
    );
    expect(off).toEqual({ runId: runA, nextTryAt: "2026-10-11T10:05:00.000Z", autoResume: false });
    expect(mergeTransientRecovery(off, { runId: runA, nextTryAt: null }).autoResume).toBe(false);
  });

  it("does not carry a choice over to a different run", () => {
    expect(
      mergeTransientRecovery(
        { runId: runA, nextTryAt: null, autoResume: false },
        { runId: runB, nextTryAt: "2026-10-11T10:05:00.000Z" },
      ).autoResume,
    ).toBe(true);
  });
});
