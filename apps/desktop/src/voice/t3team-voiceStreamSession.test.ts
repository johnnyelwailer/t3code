import { describe, expect, it, vi } from "vite-plus/test";

import { pcm16FromBase64 } from "./t3team-voicePcm.ts";
import {
  createVoiceStreamSession,
  type VoiceStreamTranscription,
} from "./t3team-voiceStreamSession.ts";
import { FRAME_MS, fakeSilero, ROOM, SPEECH, tone } from "./t3team-voiceTestAudio.ts";

function setup(
  options: { language?: string; silenceMs?: number; isWorkerReady?: () => boolean } = {},
) {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const pending: Array<(result: VoiceStreamTranscription) => void> = [];
  const calls: Array<{ language: string; samples: number }> = [];
  const session = createVoiceStreamSession({
    configuredLanguage: options.language ?? "auto",
    silenceMs: options.silenceMs ?? 1000,
    transcribe: ({ pcm16Base64, language }) => {
      calls.push({ language, samples: pcm16FromBase64(pcm16Base64).length });
      return new Promise((resolve) => pending.push(resolve));
    },
    detect: fakeSilero,
    emit: (event) => events.push(event),
    log: vi.fn(),
    ...(options.isWorkerReady ? { isWorkerReady: options.isWorkerReady } : {}),
  });
  const feed = (amplitude: number, ms: number) => {
    for (let at = 0; at < ms; at += FRAME_MS) session.push(tone(FRAME_MS, amplitude));
  };
  const settle = async (result: VoiceStreamTranscription) => {
    pending.shift()?.(result);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { session, events, calls, pending, feed, settle };
}

const ok = (text: string, language = "en", elapsedMs = 400): VoiceStreamTranscription => ({
  ok: true,
  text,
  language,
  elapsedMs,
});

describe("createVoiceStreamSession", () => {
  it("emits a level per chunk and starts no partial before anyone speaks", () => {
    const { events, calls, feed } = setup();
    feed(ROOM, 1500);
    expect(events.filter((event) => event.type === "level")).toHaveLength(15);
    expect(calls).toEqual([]);
  });

  it("streams a partial while speech continues and never overlaps passes", async () => {
    const { events, calls, pending, feed, settle } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    expect(calls).toHaveLength(1);
    feed(SPEECH, 2000);
    expect(calls).toHaveLength(1);
    await settle(ok("hello wor"));
    expect(events.find((event) => event.type === "partial")).toMatchObject({ text: "hello wor" });
    feed(SPEECH, 2500);
    expect(calls).toHaveLength(2);
    expect(pending).toHaveLength(1);
  });

  it("widens the gap after a slow pass so the worker is not kept saturated", async () => {
    const { calls, feed, settle } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    await settle(ok("slow", "en", 5000));
    feed(SPEECH, 3000);
    expect(calls).toHaveLength(1);
    feed(SPEECH, 2500);
    expect(calls).toHaveLength(2);
  });

  it("backs off after one slow partial but keeps streaming", async () => {
    const { calls, feed, settle } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    await settle(ok("slow once", "en", 9_000));
    feed(SPEECH, 17_000);
    expect(calls).toHaveLength(1);
    feed(SPEECH, 1_500);
    expect(calls).toHaveLength(2);
  });

  it("stops partials only after three slow passes in a row, across utterances", async () => {
    const { calls, pending, feed, settle } = setup();
    feed(ROOM, 600);
    for (let pass = 1; pass <= 3; pass += 1) {
      const before = calls.length;
      feed(SPEECH, 2500);
      expect(calls).toHaveLength(before + 1);
      await settle(ok("slow", "en", 9_000));
      feed(ROOM, 1_300);
      await settle(ok("final"));
    }
    const before = calls.length;
    feed(SPEECH, 10_000);
    expect(calls).toHaveLength(before);
    expect(pending).toHaveLength(0);
  });

  it("judges a partial by its pass time, not the time it waited for a cold model", async () => {
    const { calls, feed, settle } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    await settle({ ok: true, text: "cold", language: "en", elapsedMs: 12_000, passMs: 300 });
    feed(SPEECH, 2000);
    expect(calls).toHaveLength(2);
  });

  it("holds partials while the worker warms up, then streams the speech said meanwhile", async () => {
    let ready = false;
    const harness = setup({ isWorkerReady: () => ready });
    harness.feed(ROOM, 600);
    harness.feed(SPEECH, 4000);
    expect(harness.calls).toHaveLength(0);
    ready = true;
    harness.feed(SPEECH, 100);
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]!.samples).toBeGreaterThan(16 * 4000);
  });

  describe("language lock", () => {
    const languageEvents = (events: Array<{ type: string }>) =>
      events.filter((event) => event.type === "language");

    async function dictate(
      harness: ReturnType<typeof setup>,
      detected: readonly string[],
      text = "words",
    ) {
      harness.feed(ROOM, 600);
      for (const language of detected) {
        harness.feed(SPEECH, 2500);
        await harness.settle(ok(text, language));
      }
      harness.feed(SPEECH, 2500);
    }

    it("ignores the vote of a first partial that heard under three seconds of speech", async () => {
      const harness = setup();
      await dictate(harness, ["nl", "de", "de"]);
      expect(languageEvents(harness.events)).toEqual([{ type: "language", language: "de" }]);
    });

    it("runs every partial on auto-detection until the lock, then on the locked language", async () => {
      const harness = setup();
      await dictate(harness, ["de", "de", "de"]);
      expect(harness.calls.map((call) => call.language)).toEqual(["auto", "auto", "auto", "de"]);
    });

    it("keeps detecting while votes disagree and settles on auto when they tie", async () => {
      const harness = setup();
      await dictate(harness, ["nl", "nl", "de", "en"]);
      expect(languageEvents(harness.events)).toEqual([]);
      expect(harness.calls.map((call) => call.language)).toEqual([
        "auto",
        "auto",
        "auto",
        "auto",
        "auto",
      ]);
    });

    it("never locks a recording that is too short to vote", async () => {
      const harness = setup();
      harness.feed(ROOM, 600);
      harness.feed(SPEECH, 2500);
      await harness.settle(ok("hallo", "nl"));
      harness.feed(ROOM, 1500);
      expect(languageEvents(harness.events)).toEqual([]);
      expect(harness.calls.map((call) => call.language)).toEqual(["auto", "auto"]);
    });

    it("lets a pinned language win every pass whatever the detection says", async () => {
      const harness = setup({ language: "de" });
      await dictate(harness, ["nl", "nl", "nl"]);
      expect(languageEvents(harness.events)).toEqual([]);
      expect(harness.calls.map((call) => call.language)).toEqual(["de", "de", "de", "de"]);
    });

    it("votes again for the next recording instead of keeping the last lock", async () => {
      const first = setup();
      await dictate(first, ["nl", "nl", "nl"]);
      expect(first.calls.at(-1)?.language).toBe("nl");

      const second = setup();
      await dictate(second, ["en", "en", "en"]);
      expect(second.calls.map((call) => call.language)).toEqual(["auto", "auto", "auto", "en"]);
      expect(languageEvents(second.events)).toEqual([{ type: "language", language: "en" }]);
    });
  });

  it("drops results that finish after stop", async () => {
    const { session, events, feed, settle } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    session.stop();
    await settle(ok("late"));
    expect(events.some((event) => event.type === "partial")).toBe(false);
    feed(SPEECH, 500);
    expect(events.filter((event) => event.type === "level")).toHaveLength(31);
  });
});
