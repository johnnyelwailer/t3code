import { describe, expect, it, vi } from "vite-plus/test";

import { pcm16FromBase64 } from "./t3team-voicePcm.ts";
import {
  createVoiceStreamSession,
  type VoiceStreamTranscription,
} from "./t3team-voiceStreamSession.ts";
import { FRAME_MS, ROOM, SPEECH, tone } from "./t3team-voiceTestAudio.ts";

function setup(options: { language?: string; silenceMs?: number } = {}) {
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
    emit: (event) => events.push(event),
    log: vi.fn(),
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

  it("stops partials for the session after one that blew the latency budget", async () => {
    const { events, calls, feed, settle } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    await settle(ok("far too late", "en", 20_000));
    expect(events.filter((event) => event.type === "partial")).toHaveLength(1);
    feed(SPEECH, 30_000);
    expect(calls).toHaveLength(1);
  });

  it("locks the language after two transcripts and uses it for later passes", async () => {
    const { events, calls, feed, settle } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    await settle(ok("one", "de"));
    feed(SPEECH, 2500);
    await settle(ok("one two", "de"));
    expect(events.filter((event) => event.type === "language")).toEqual([
      { type: "language", language: "de" },
    ]);
    feed(SPEECH, 2500);
    expect(calls.map((call) => call.language)).toEqual(["auto", "auto", "de"]);
  });

  it("signals auto-commit once on silence and stops starting partials", () => {
    const { events, calls, feed } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 1000);
    feed(ROOM, 1500);
    expect(events.filter((event) => event.type === "auto-commit")).toEqual([
      { type: "auto-commit", reason: "silence" },
    ]);
    const before = calls.length;
    feed(SPEECH, 3000);
    expect(calls).toHaveLength(before);
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
