import { describe, expect, it } from "vite-plus/test";

import {
  appendT3TeamThreadDebugEvent,
  summarizeT3TeamServerThread,
  summarizeT3TeamThreadEvent,
  type T3TeamThreadDebugEvent,
} from "~/t3team/chat/t3team-threadDebug";

describe("appendT3TeamThreadDebugEvent", () => {
  it("keeps only the newest entries when the buffer exceeds its cap", () => {
    const events: T3TeamThreadDebugEvent[] = [
      { at: "2026-05-19T00:00:00.000Z", name: "one", payload: {} },
      { at: "2026-05-19T00:00:01.000Z", name: "two", payload: {} },
    ];

    const result = appendT3TeamThreadDebugEvent(
      events,
      { at: "2026-05-19T00:00:02.000Z", name: "three", payload: {} },
      2,
    );

    expect(result.map((event) => event.name)).toEqual(["two", "three"]);
  });
});

describe("summarizeT3TeamThreadEvent", () => {
  it("picks the most useful top-level fields from backend events", () => {
    expect(
      summarizeT3TeamThreadEvent({
        type: "thread.message.assistant.delta",
        threadId: "thread-1",
        turnId: "turn-1",
        status: "running",
        extra: "ignored",
      }),
    ).toEqual({
      type: "thread.message.assistant.delta",
      threadId: "thread-1",
      turnId: "turn-1",
      status: "running",
    });
  });
});

describe("summarizeT3TeamServerThread", () => {
  it("extracts a compact summary from live thread state", () => {
    expect(
      summarizeT3TeamServerThread({
        id: "thread-1",
        projectId: "project-1",
        title: "My thread",
        messages: [{}, {}],
        latestTurn: { turnId: "turn-1" },
        session: { status: "running" },
        archivedAt: null,
        error: null,
      }),
    ).toEqual({
      id: "thread-1",
      projectId: "project-1",
      title: "My thread",
      messageCount: 2,
      latestTurnId: "turn-1",
      sessionStatus: "running",
      archivedAt: null,
      error: null,
    });
  });
});
