import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../../session-logic";
import { withoutSupersededRetryErrors } from "./MessagesTimeline.logic";

const at = "2026-10-15T10:00:00.000Z";

const errorEntry = (runId: string): TimelineEntry =>
  ({
    id: `error:${runId}`,
    kind: "event",
    createdAt: at,
    projectedItem: {
      item: { id: `terminal-failure:${runId}`, runId, type: "error", status: "failed" },
    },
  }) as unknown as TimelineEntry;

const messageEntry = (id: string): TimelineEntry =>
  ({
    id,
    kind: "message",
    createdAt: at,
    message: { id, role: "user", text: "Continue where you left off.", createdAt: at },
  }) as unknown as TimelineEntry;

describe("withoutSupersededRetryErrors", () => {
  it("keeps only the error row of the latest automatic restart", () => {
    const entries = [
      messageEntry("user-1"),
      errorEntry("run:1"),
      messageEntry("t3team-transient-retry:run:1"),
      errorEntry("run:2"),
      messageEntry("t3team-transient-retry:run:2"),
      errorEntry("run:3"),
    ];
    expect(withoutSupersededRetryErrors(entries).map((entry) => entry.id)).toEqual([
      "user-1",
      "t3team-transient-retry:run:1",
      "t3team-transient-retry:run:2",
      "error:run:3",
    ]);
  });

  it("leaves a thread without automatic restarts untouched", () => {
    const entries = [messageEntry("user-1"), errorEntry("run:1")];
    expect(withoutSupersededRetryErrors(entries)).toBe(entries);
  });
});
