import { describe, expect, it } from "vite-plus/test";

import {
  createActivityGate,
  NO_SPEECH_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  type GateCommit,
} from "./t3team-voiceActivityGate.ts";
import { FRAME_MS, ROOM, SPEECH, tone } from "./t3team-voiceTestAudio.ts";

function feed(gate: ReturnType<typeof createActivityGate>, amplitude: number, ms: number) {
  const commits: GateCommit[] = [];
  const speaking: boolean[] = [];
  for (let at = 0; at < ms; at += FRAME_MS) {
    const frame = gate.push(tone(FRAME_MS, amplitude));
    speaking.push(frame.speaking);
    if (frame.commit) commits.push(frame.commit);
  }
  return { commits, speaking };
}

describe("createActivityGate", () => {
  it("commits an utterance after the silence window that follows real speech", () => {
    const gate = createActivityGate({ silenceMs: 1000 });
    feed(gate, ROOM, 600);
    expect(feed(gate, SPEECH, 1000).commits).toEqual([]);
    expect(feed(gate, ROOM, 900).commits).toEqual([]);
    expect(feed(gate, ROOM, 200).commits).toEqual(["silence"]);
    expect(feed(gate, ROOM, 2000).commits).toEqual([]);
  });

  it("keeps listening after a commit and commits the next utterance too", () => {
    const gate = createActivityGate({ silenceMs: 1000 });
    feed(gate, ROOM, 600);
    feed(gate, SPEECH, 1000);
    expect(feed(gate, ROOM, 1100).commits).toEqual(["silence"]);
    expect(feed(gate, SPEECH, 1500).commits).toEqual([]);
    expect(feed(gate, ROOM, 1100).commits).toEqual(["silence"]);
  });

  it("reports how long it has been quiet", () => {
    const gate = createActivityGate({ silenceMs: 5000 });
    feed(gate, ROOM, 600);
    feed(gate, SPEECH, 500);
    let silentMs = 0;
    for (let at = 0; at < 700; at += FRAME_MS) silentMs = gate.push(tone(FRAME_MS, ROOM)).silentMs;
    expect(silentMs).toBeCloseTo(700, -1);
  });

  it("ends the session as idle when it goes quiet for long after an utterance", () => {
    const gate = createActivityGate({ silenceMs: 1000 });
    feed(gate, ROOM, 600);
    feed(gate, SPEECH, 1000);
    feed(gate, ROOM, 1100);
    expect(feed(gate, ROOM, NO_SPEECH_TIMEOUT_MS + 1000).commits).toEqual([]);
    expect(feed(gate, ROOM, SESSION_IDLE_TIMEOUT_MS).commits).toEqual(["idle"]);
    expect(feed(gate, ROOM, 5000).commits).toEqual([]);
  });

  it("treats steady room tone above the floor as silence, not speech", () => {
    const gate = createActivityGate({ silenceMs: 1000 });
    const { speaking } = feed(gate, 0.02, 3000);
    expect(speaking.some(Boolean)).toBe(false);
  });

  it("ignores a click shorter than the minimum speech duration", () => {
    const gate = createActivityGate({ silenceMs: 500 });
    feed(gate, ROOM, 600);
    feed(gate, SPEECH, 100);
    expect(feed(gate, ROOM, 1000).commits).toEqual([]);
  });

  it("commits an empty recording after the no-speech timeout", () => {
    const gate = createActivityGate({ silenceMs: 1000 });
    expect(feed(gate, ROOM, NO_SPEECH_TIMEOUT_MS - 200).commits).toEqual([]);
    expect(feed(gate, ROOM, 400).commits).toEqual(["no-speech"]);
  });

  it("never commits when silence detection is off", () => {
    const gate = createActivityGate({ silenceMs: 0 });
    feed(gate, ROOM, 600);
    feed(gate, SPEECH, 1000);
    expect(feed(gate, ROOM, NO_SPEECH_TIMEOUT_MS + 2000).commits).toEqual([]);
  });

  it("reports a 0-1 level that follows loudness", () => {
    const gate = createActivityGate({ silenceMs: 1000 });
    expect(gate.push(tone(FRAME_MS, 0)).level).toBe(0);
    expect(gate.push(tone(FRAME_MS, 0.05)).level).toBeCloseTo(0.5, 1);
    expect(gate.push(tone(FRAME_MS, 0.9)).level).toBe(1);
  });
});
