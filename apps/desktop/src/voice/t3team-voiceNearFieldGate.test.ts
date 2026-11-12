import { describe, expect, it } from "vite-plus/test";

import { createNearFieldGate, isNearSpeaker, speechLevel } from "./t3team-voiceNearFieldGate.ts";

/** One second of a 220 Hz tone at `amplitude` (0..1), as 16 kHz PCM16. */
const voice = (amplitude: number, ms = 1_000) =>
  Int16Array.from({ length: 16 * ms }, (_, i) =>
    Math.round(Math.sin((2 * Math.PI * 220 * i) / 16_000) * amplitude * 32767),
  );

describe("speechLevel", () => {
  it("reads a frame percentile, so pauses inside an utterance do not lower it", () => {
    const tone = voice(0.2);
    const withPause = Int16Array.from([...tone, ...new Int16Array(16_000)]);
    expect(speechLevel(tone)).toBeCloseTo(0.2 / Math.SQRT2, 2);
    expect(speechLevel(withPause)).toBeCloseTo(speechLevel(tone), 2);
    expect(speechLevel(new Int16Array(0))).toBe(0);
  });
});

describe("createNearFieldGate", () => {
  it("keeps everything until the speaker has been heard", () => {
    const gate = createNearFieldGate();
    expect(gate.judge(voice(0.02))).toMatchObject({ keep: true, reference: null });
  });

  it("drops voices far quieter than the speaker and keeps the speaker's quieter words", () => {
    const gate = createNearFieldGate();
    for (const amplitude of [0.2, 0.25, 0.18]) expect(gate.judge(voice(amplitude)).keep).toBe(true);
    expect(gate.judge(voice(0.03)).keep).toBe(false);
    expect(gate.judge(voice(0.1)).keep).toBe(true);
  });

  it("is not thrown off by one shout: the reference is a median", () => {
    const gate = createNearFieldGate();
    for (const amplitude of [0.1, 0.1, 0.9]) gate.judge(voice(amplitude));
    expect(gate.judge(voice(0.08)).keep).toBe(true);
  });

  it("never learns from a partial window", () => {
    const gate = createNearFieldGate();
    gate.peek(voice(0.5));
    expect(gate.judge(voice(0.05)).reference).toBeNull();
  });
});

describe("isNearSpeaker", () => {
  it("logs levels (no text) and clears the partial when it drops", () => {
    const gate = createNearFieldGate();
    gate.judge(voice(0.3));
    const lines: string[] = [];
    let cleared = 0;
    expect(
      isNearSpeaker(
        gate,
        voice(0.02),
        "utterance",
        (l) => lines.push(l),
        () => cleared++,
      ),
    ).toBe(false);
    expect(cleared).toBe(1);
    expect(lines[0]).toMatch(
      /^stream dropped utterance as background: level 0\.01\d under 0\.3 x speaker 0\.21\d$/,
    );
    expect(
      isNearSpeaker(
        undefined,
        voice(0.02),
        "tail",
        () => undefined,
        () => cleared++,
      ),
    ).toBe(true);
  });
});
