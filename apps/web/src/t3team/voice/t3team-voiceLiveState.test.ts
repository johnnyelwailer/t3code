import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  voiceLiveThreads,
  withVoiceLiveState,
  type VoiceThreadShell,
} from "./t3team-voiceLiveState";

const shell = (id: string, overrides: Partial<VoiceThreadShell> = {}): VoiceThreadShell => ({
  id: ThreadId.make(id),
  title: `Thread ${id}`,
  updatedAt: "2026-10-19T10:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
  settledAt: null,
  hasPendingUserInput: false,
  hasPendingApprovals: false,
  latestRun: null,
  ...overrides,
});

const VOICE = ThreadId.make("voice");

describe("voiceLiveThreads", () => {
  it("lists live threads newest first and leaves out the voice thread and finished ones", () => {
    const state = voiceLiveThreads(
      [
        shell("old", { updatedAt: "2026-10-18T10:00:00.000Z" }),
        shell("voice"),
        shell("new", { updatedAt: "2026-10-19T12:00:00.000Z" }),
        shell("archived", { archivedAt: "2026-10-19T09:00:00.000Z" }),
        shell("settled", { settledAt: "2026-10-19T09:00:00.000Z" }),
      ],
      VOICE,
    );
    expect(state.total).toBe(2);
    expect(state.listed.map((thread) => thread.id)).toEqual(["new", "old"]);
  });

  it("flags a thread that waits on the user", () => {
    const state = voiceLiveThreads([shell("ask", { hasPendingUserInput: true })], VOICE);
    expect(state.listed[0]?.status).toBe("waiting-for-user");
  });

  it("caps the index and clips long titles so the context stays a few hundred tokens", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      shell(`t${index}`, { title: "x".repeat(200) }),
    );
    const state = voiceLiveThreads(many, VOICE);
    expect(state.total).toBe(30);
    expect(state.listed).toHaveLength(20);
    expect(state.listed[0]?.title).toHaveLength(80);
  });
});

describe("withVoiceLiveState", () => {
  it("appends one live-state chip to the utterance and carries the payload as its record", () => {
    const live = withVoiceLiveState("what is blocked", voiceLiveThreads([shell("a")], VOICE));
    expect(live.text).toBe(
      "what is blocked\n\n[live state](t3-context://v1/voice-state/voice-live-state)",
    );
    expect(live.records).toHaveLength(1);
    expect(live.records[0]).toMatchObject({
      contextId: "voice-live-state",
      kind: "voice-state",
      payload: { activeThreads: 1 },
    });
  });
});
