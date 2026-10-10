import { ThreadId, type T3TeamThreadFacts } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyT3TeamThreadFactsEvent,
  EMPTY_T3TEAM_THREAD_FACTS,
  supportsT3TeamThreadFacts,
} from "./t3team-threadFacts.ts";

const THREAD_A = ThreadId.make("thread-a");
const THREAD_B = ThreadId.make("thread-b");

function facts(threadId: ThreadId, patch: Partial<T3TeamThreadFacts> = {}): T3TeamThreadFacts {
  return { threadId, updatedAt: "2026-10-03T10:00:00.000Z", ...patch };
}

describe("applyT3TeamThreadFactsEvent", () => {
  it("replaces the whole map on a snapshot so facts lost while away do not linger", () => {
    const stale = applyT3TeamThreadFactsEvent(EMPTY_T3TEAM_THREAD_FACTS, {
      type: "snapshot",
      facts: [facts(THREAD_A, { childStatus: "2 children running" })],
    });

    const next = applyT3TeamThreadFactsEvent(stale, {
      type: "snapshot",
      facts: [
        facts(THREAD_B, {
          workflowRunStatus: {
            status: "running",
            pendingKind: null,
            wakeAt: null,
            updatedAt: "2026-10-03T10:00:00.000Z",
          },
        }),
      ],
    });

    expect([...next.keys()]).toEqual([THREAD_B]);
    expect(next.get(THREAD_B)?.workflowRunStatus?.status).toBe("running");
  });

  it("upserts one thread without touching the others or the previous map", () => {
    const before = applyT3TeamThreadFactsEvent(EMPTY_T3TEAM_THREAD_FACTS, {
      type: "snapshot",
      facts: [facts(THREAD_A, { activityLabel: "Reading files" }), facts(THREAD_B)],
    });

    const after = applyT3TeamThreadFactsEvent(before, {
      type: "upsert",
      facts: facts(THREAD_A, { activityLabel: "Running tests" }),
    });

    expect(after.get(THREAD_A)?.activityLabel).toBe("Running tests");
    expect(after.get(THREAD_B)).toBe(before.get(THREAD_B));
    expect(before.get(THREAD_A)?.activityLabel).toBe("Reading files");
  });

  it("removes a thread's facts and keeps the map identity for an unknown thread", () => {
    const before = applyT3TeamThreadFactsEvent(EMPTY_T3TEAM_THREAD_FACTS, {
      type: "snapshot",
      facts: [facts(THREAD_A), facts(THREAD_B)],
    });

    const removed = applyT3TeamThreadFactsEvent(before, { type: "removed", threadId: THREAD_A });
    expect([...removed.keys()]).toEqual([THREAD_B]);

    const unchanged = applyT3TeamThreadFactsEvent(removed, {
      type: "removed",
      threadId: ThreadId.make("thread-missing"),
    });
    expect(unchanged).toBe(removed);
  });
});

describe("supportsT3TeamThreadFacts", () => {
  it("requires the server to advertise the flag", () => {
    expect(supportsT3TeamThreadFacts(undefined)).toBe(false);
    expect(supportsT3TeamThreadFacts({})).toBe(false);
    expect(supportsT3TeamThreadFacts({ threadFacts: false })).toBe(false);
    expect(supportsT3TeamThreadFacts({ threadFacts: true })).toBe(true);
  });
});
