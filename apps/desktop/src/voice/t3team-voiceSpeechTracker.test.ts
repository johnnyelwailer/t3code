import { describe, expect, it, vi } from "vite-plus/test";

import { createPcmBuffer } from "./t3team-voicePcmBuffer.ts";
import { msToSamples, samplesToMs } from "./t3team-voicePcm.ts";
import {
  createSpeechTracker,
  type SpeechDetect,
  type UtteranceBounds,
} from "./t3team-voiceSpeechTracker.ts";
import { FRAME_MS, fakeSilero, ROOM, SPEECH, tone } from "./t3team-voiceTestAudio.ts";

const LOUD_NOISE = 0.2;

function setup(detect: SpeechDetect = fakeSilero, pauseMs = 600) {
  const audio = createPcmBuffer();
  const utterances: UtteranceBounds[] = [];
  const log = vi.fn();
  const tracker = createSpeechTracker({
    audio,
    detect,
    pauseMs,
    onUtterance: (bounds) => utterances.push(bounds),
    log,
  });
  /** `energy` is what the energy gate would say about these frames. */
  const feed = (amplitude: number, ms: number, energy = amplitude > ROOM) => {
    for (let at = 0; at < ms; at += FRAME_MS) {
      audio.push(tone(FRAME_MS, amplitude));
      tracker.push(energy);
    }
  };
  const ms = (bounds: UtteranceBounds) => ({
    startMs: Math.round(samplesToMs(bounds.start)),
    endMs: Math.round(samplesToMs(bounds.end)),
  });
  return { audio, tracker, utterances, feed, ms, log };
}

describe("createSpeechTracker", () => {
  it("never opens an utterance on audio Silero hears no speech in, however loud", () => {
    const { tracker, utterances, feed } = setup(() => []);
    feed(LOUD_NOISE, 10_000);
    expect(tracker.speechStart).toBeNull();
    expect(utterances).toEqual([]);
  });

  it("opens on speech and commits it once Silero heard a pause, with its bounds", () => {
    const { tracker, utterances, feed, ms } = setup();
    feed(ROOM, 1_000);
    feed(SPEECH, 2_000);
    expect(tracker.speechStart).not.toBeNull();
    feed(ROOM, 500);
    expect(utterances).toEqual([]);
    feed(ROOM, 500);
    expect(utterances.map(ms)).toEqual([{ startMs: 1_000, endMs: 3_000 }]);
    expect(tracker.speechStart).toBeNull();
  });

  it("hears the next utterance after a commit without re-reading the first", () => {
    const { utterances, feed, ms } = setup();
    feed(SPEECH, 1_000);
    feed(ROOM, 1_000);
    feed(SPEECH, 800);
    feed(ROOM, 1_000);
    expect(utterances.map(ms)).toEqual([
      { startMs: 0, endMs: 1_000 },
      { startMs: 2_000, endMs: 2_800 },
    ]);
  });

  it("with pauseMs 0 never commits on a pause, and flush hands over the open utterance", async () => {
    const { audio, tracker, utterances, feed } = setup(fakeSilero, 0);
    feed(SPEECH, 1_000);
    feed(ROOM, 3_000);
    expect(utterances).toEqual([]);
    expect(await tracker.flush()).toEqual({ start: 0, end: audio.end });
  });

  it("treats an unknown answer as speech when the room was loud, and as nothing when quiet", () => {
    const loud = setup(() => null);
    loud.feed(SPEECH, 1_000, true);
    expect(loud.tracker.speechStart).toBe(0);
    expect(loud.log).toHaveBeenCalledWith(expect.stringContaining("vad unknown"));

    const quiet = setup(() => null);
    quiet.feed(ROOM, 3_000, false);
    expect(quiet.tracker.speechStart).toBeNull();
  });

  it("keeps the audio while Silero loads and judges the whole backlog once it answers", () => {
    let ready = false;
    const { tracker, audio, utterances, feed, ms } = setup((pcm) =>
      ready ? fakeSilero(pcm) : "pending",
    );
    feed(ROOM, 500);
    feed(SPEECH, 1_500);
    feed(ROOM, 1_000);
    expect(utterances).toEqual([]);
    expect(tracker.keepFrom).toBe(0);
    ready = true;
    feed(ROOM, 300);
    expect(utterances.map(ms)).toEqual([{ startMs: 500, endMs: 2_000 }]);
    expect(audio.end).toBe(msToSamples(3_300));
  });

  it("cuts an utterance that runs past whisper's window", () => {
    const { utterances, feed } = setup();
    feed(SPEECH, 29_000);
    expect(utterances).toHaveLength(1);
    expect(samplesToMs(utterances[0]!.end - utterances[0]!.start)).toBeGreaterThanOrEqual(28_000);
  });

  it("waits for an async answer and looks one at a time", async () => {
    const answers: Array<(spans: ReturnType<typeof fakeSilero>) => void> = [];
    const detect = vi.fn(() => new Promise<ReturnType<typeof fakeSilero>>((r) => answers.push(r)));
    const { tracker, feed } = setup(detect);
    feed(SPEECH, 1_000);
    expect(detect).toHaveBeenCalledTimes(1);
    answers.shift()?.([{ startMs: 0, endMs: 300 }]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(tracker.speechStart).toBe(0);
  });
});
