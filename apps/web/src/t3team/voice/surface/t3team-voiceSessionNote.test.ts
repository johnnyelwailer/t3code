import { describe, expect, it } from "vite-plus/test";

import {
  VOICE_HEARD_FLASH_MS,
  voiceSessionNote,
  voiceSessionNoteExpiresAt,
  voiceWritingLabel,
} from "./t3team-voiceSessionNote";

const NOW = 100_000;
const quiet = { writing: 0, writingSinceMs: null, heard: null } as const;

describe("voiceSessionNote", () => {
  it("listens by default and while idle", () => {
    expect(
      voiceSessionNote({ state: "recording", endedAtMs: null, live: quiet, now: NOW }),
    ).toEqual({ kind: "listening" });
    expect(voiceSessionNote({ state: "idle", endedAtMs: null, live: quiet, now: NOW })).toEqual({
      kind: "listening",
    });
  });

  it("is writing while a committed utterance is in flight, even though the recording is open", () => {
    const live = { writing: 2, writingSinceMs: NOW - 5_000, heard: null };
    expect(voiceSessionNote({ state: "recording", endedAtMs: null, live, now: NOW })).toEqual({
      kind: "writing",
      sinceMs: NOW - 5_000,
    });
  });

  it("is writing from the moment the recording ended when only the last part is left", () => {
    expect(
      voiceSessionNote({ state: "transcribing", endedAtMs: NOW - 2_000, live: quiet, now: NOW }),
    ).toEqual({ kind: "writing", sinceMs: NOW - 2_000 });
  });

  it("shows heard briefly after an utterance came back, never over a pass still writing", () => {
    const heard = { text: "hi", atMs: NOW - 500 };
    expect(
      voiceSessionNote({
        state: "recording",
        endedAtMs: null,
        live: { ...quiet, heard },
        now: NOW,
      }),
    ).toEqual({ kind: "heard" });
    expect(
      voiceSessionNote({
        state: "recording",
        endedAtMs: null,
        live: { ...quiet, heard },
        now: NOW + VOICE_HEARD_FLASH_MS,
      }),
    ).toEqual({ kind: "listening" });
    expect(
      voiceSessionNote({
        state: "recording",
        endedAtMs: null,
        live: { writing: 1, writingSinceMs: NOW - 100, heard },
        now: NOW,
      }),
    ).toMatchObject({ kind: "writing" });
  });
});

describe("voiceWritingLabel", () => {
  it("starts counting after the first second", () => {
    expect(voiceWritingLabel(NOW, NOW + 400)).toBe("Transcribing…");
    expect(voiceWritingLabel(NOW, NOW + 1_000)).toBe("Transcribing… 1 s");
    expect(voiceWritingLabel(NOW, NOW + 21_900)).toBe("Transcribing… 21 s");
  });
});

describe("voiceSessionNoteExpiresAt", () => {
  it("wakes at the next whole second of a count", () => {
    expect(voiceSessionNoteExpiresAt({ kind: "writing", sinceMs: NOW - 2_300 }, quiet, NOW)).toBe(
      NOW + 700,
    );
  });

  it("wakes when the heard flash ends, and never for a calm listener", () => {
    const heard = { text: "hi", atMs: NOW - 500 };
    expect(voiceSessionNoteExpiresAt({ kind: "heard" }, { heard }, NOW)).toBe(
      NOW - 500 + VOICE_HEARD_FLASH_MS,
    );
    expect(voiceSessionNoteExpiresAt({ kind: "listening" }, quiet, NOW)).toBeNull();
  });
});

describe("voiceSessionNote warm-up", () => {
  it("says warming with its progress while the model loads and the microphone already records", () => {
    const live = { ...quiet, warmup: { stage: "loading" as const, percent: 15 } };
    expect(voiceSessionNote({ state: "recording", endedAtMs: null, live, now: NOW })).toEqual({
      kind: "warming",
      percent: 15,
    });
  });

  it("gives way to writing once the recording ended", () => {
    const live = { ...quiet, warmup: { stage: "loading" as const, percent: 15 } };
    expect(
      voiceSessionNote({ state: "transcribing", endedAtMs: NOW - 1_000, live, now: NOW }),
    ).toEqual({ kind: "writing", sinceMs: NOW - 1_000 });
  });
});
