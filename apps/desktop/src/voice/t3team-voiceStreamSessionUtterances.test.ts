import { describe, expect, it, vi } from "vite-plus/test";

import { NO_SPEECH_TIMEOUT_MS, SESSION_IDLE_TIMEOUT_MS } from "./t3team-voiceActivityGate.ts";
import { pcm16FromBase64, samplesToMs } from "./t3team-voicePcm.ts";
import {
  createVoiceStreamSession,
  type VoiceStreamTranscription,
} from "./t3team-voiceStreamSession.ts";
import { FRAME_MS, ROOM, SPEECH, tone } from "./t3team-voiceTestAudio.ts";

type Call = { readonly language: string; readonly ms: number };

function setup(options: { language?: string } = {}) {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const waiting: Array<(result: VoiceStreamTranscription) => void> = [];
  const calls: Call[] = [];
  const session = createVoiceStreamSession({
    configuredLanguage: options.language ?? "auto",
    silenceMs: 1000,
    transcribe: ({ pcm16Base64, language }) => {
      calls.push({ language, ms: samplesToMs(pcm16FromBase64(pcm16Base64).length) });
      return new Promise((resolve) => waiting.push(resolve));
    },
    emit: (event) => events.push(event),
    log: vi.fn(),
  });
  const feed = (amplitude: number, ms: number) => {
    for (let at = 0; at < ms; at += FRAME_MS) session.push(tone(FRAME_MS, amplitude));
  };
  const answer = async (text: string, language = "en", elapsedMs = 300) => {
    waiting.shift()?.({ ok: true, text, language, elapsedMs });
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
  };
  const ofType = (type: string) => events.filter((event) => event.type === type);
  /** One utterance: a second of room tone, speech, then the silence that commits it. */
  const speakAndPause = (speechMs = 1200) => {
    feed(ROOM, 600);
    feed(SPEECH, speechMs);
    feed(ROOM, 1100);
  };
  return { session, events, calls, waiting, feed, answer, ofType, speakAndPause };
}

describe("a recording session across utterances", () => {
  it("writes an utterance down on its pause and keeps listening", async () => {
    const { session, events, calls, feed, answer, ofType, speakAndPause } = setup();
    speakAndPause();
    expect(ofType("auto-commit")).toEqual([{ type: "auto-commit", reason: "silence" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.ms).toBeGreaterThan(1200);
    expect(calls[0]!.ms).toBeLessThan(2400);

    await answer("open the board");
    expect(ofType("utterance")).toEqual([
      { type: "utterance", text: "open the board", elapsedMs: 300 },
    ]);

    const levels = ofType("level").length;
    feed(SPEECH, 300);
    expect(ofType("level")).toHaveLength(levels + 3);
    expect(events.at(-1)).toMatchObject({ type: "level" });
    session.stop();
  });

  it("commits the second utterance on its own pause, with its own audio", async () => {
    const { calls, feed, answer, ofType } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 1200);
    feed(ROOM, 1100);
    await answer("first");
    feed(SPEECH, 2600);
    feed(ROOM, 1100);
    expect(ofType("auto-commit")).toHaveLength(2);
    await answer("partial of the second", "en");
    await answer("second");
    expect(ofType("utterance").map((event) => event.text)).toEqual(["first", "second"]);
    const finals = calls.filter((call) => call.ms > 2500);
    expect(finals.at(-1)!.ms).toBeLessThan(4200);
  });

  it("never starts a partial while a final waits, and queues the final behind a running partial", async () => {
    const { calls, feed, answer, ofType } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    expect(calls).toHaveLength(1);
    feed(ROOM, 1100);
    expect(calls).toHaveLength(1);
    await answer("partial");
    expect(calls).toHaveLength(2);
    feed(SPEECH, 4000);
    expect(calls).toHaveLength(2);
    await answer("the final");
    expect(ofType("utterance")).toEqual([{ type: "utterance", text: "the final", elapsedMs: 300 }]);
  });

  it("drops a partial that finishes after its utterance was committed", async () => {
    const { feed, answer, ofType } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 2500);
    feed(ROOM, 1100);
    await answer("late partial");
    expect(ofType("partial")).toEqual([]);
    await answer("final");
    expect(ofType("utterance")).toHaveLength(1);
  });

  it("keeps the language lock for later utterances", async () => {
    const { calls, feed, answer } = setup();
    feed(ROOM, 600);
    for (let round = 0; round < 3; round += 1) {
      feed(SPEECH, 2500);
      await answer("worte", "de");
    }
    feed(ROOM, 1100);
    await answer("worte", "de");
    feed(SPEECH, 1200);
    feed(ROOM, 1100);
    expect(calls.at(-1)!.language).toBe("de");
  });

  it("reports a failed final without ending the session", async () => {
    const { session, waiting, feed, ofType } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 1200);
    feed(ROOM, 1100);
    waiting.shift()?.({ ok: false, message: "worker died" });
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
    expect(ofType("utterance-failed")).toEqual([
      { type: "utterance-failed", message: "worker died" },
    ]);
    const levels = ofType("level").length;
    feed(SPEECH, 200);
    expect(ofType("level")).toHaveLength(levels + 2);
    session.stop();
  });
});

describe("ending a session", () => {
  it("writes down what was said after the last utterance and awaits the ones in flight", async () => {
    const { session, feed, answer, ofType } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 1200);
    feed(ROOM, 1100);
    feed(SPEECH, 1500);
    const finishing = session.finish();
    await answer("first");
    await answer("tail");
    expect(await finishing).toEqual({ text: "tail", committed: 1 });
    expect(ofType("utterance")).toEqual([{ type: "utterance", text: "first", elapsedMs: 300 }]);
  });

  it("asks for no extra pass when nothing was said since the last utterance", async () => {
    const { session, calls, feed, answer, speakAndPause } = setup();
    speakAndPause();
    feed(ROOM, 300);
    const finishing = session.finish();
    await answer("only");
    expect(await finishing).toEqual({ text: "", committed: 1 });
    expect(calls).toHaveLength(1);
  });

  it("returns a failed tail as an error and keeps the committed count", async () => {
    const { session, waiting, feed } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 1200);
    const finishing = session.finish();
    waiting.shift()?.({ ok: false, message: "gpu lost" });
    expect(await finishing).toEqual({ text: "", committed: 0, error: "gpu lost" });
  });

  it("drops results that arrive after a plain stop", async () => {
    const { session, events, feed, answer } = setup();
    feed(ROOM, 600);
    feed(SPEECH, 1200);
    feed(ROOM, 1100);
    session.stop();
    await answer("late");
    expect(events.some((event) => event.type === "utterance")).toBe(false);
  });
});

describe("a session nobody is talking in", () => {
  it("ends with no-speech when nothing was ever said", () => {
    const { feed, ofType } = setup();
    feed(ROOM, NO_SPEECH_TIMEOUT_MS + 500);
    expect(ofType("auto-commit")).toEqual([{ type: "auto-commit", reason: "no-speech" }]);
  });

  it("ends as idle only after a long quiet that follows an utterance", async () => {
    const { feed, ofType, speakAndPause } = setup();
    speakAndPause();
    feed(ROOM, NO_SPEECH_TIMEOUT_MS + 2000);
    expect(ofType("auto-commit")).toEqual([{ type: "auto-commit", reason: "silence" }]);
    feed(ROOM, SESSION_IDLE_TIMEOUT_MS);
    expect(ofType("auto-commit")).toEqual([
      { type: "auto-commit", reason: "silence" },
      { type: "auto-commit", reason: "idle" },
    ]);
  });
});
