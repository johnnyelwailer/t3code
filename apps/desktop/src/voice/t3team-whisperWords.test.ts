import { describe, expect, it } from "vite-plus/test";

import { joinTokenSegments } from "./t3team-whisperWords.ts";

describe("joinTokenSegments", () => {
  it("folds one-token segments back into timed words and skips whisper's markers", () => {
    expect(
      joinTokenSegments([
        { text: "[_BEG_]", t0: 0, t1: 0 },
        { text: " Öff", t0: 0, t1: 200 },
        { text: "ne", t0: 200, t1: 380 },
        { text: " das", t0: 400, t1: 600 },
        { text: " Board", t0: 620, t1: 900 },
        { text: ".", t0: 900, t1: 910 },
      ]),
    ).toEqual([
      { text: "Öffne", t0: 0, t1: 380 },
      { text: "das", t0: 400, t1: 600 },
      { text: "Board.", t0: 620, t1: 910 },
    ]);
  });
});
