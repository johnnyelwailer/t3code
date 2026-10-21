import { describe, expect, it } from "vite-plus/test";

import {
  createActivityGate,
  NO_SPEECH_TIMEOUT_MS,
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
  it("commits once after the silence window that follows real speech", () => {
    const gate = createActivityGate({ silenceMs: 1000 });
    feed(gate, ROOM, 600);
    expect(feed(gate, SPEECH, 1000).commits).toEqual([]);
    expect(feed(gate, ROOM, 900).commits).toEqual([]);
    expect(feed(gate, ROOM, 200).commits).toEqual(["silence"]);
    expect(feed(gate, ROOM, 2000).commits).toEqual([]);
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
