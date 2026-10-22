import { describe, expect, it } from "vite-plus/test";

import {
  advanceTranscriptWords,
  FRESH_WORD_MS,
  isFreshWord,
  nextSettleAt,
  splitTranscript,
} from "./t3team-voiceTranscriptWords";

describe("transcript words", () => {
  it("splits on any whitespace and drops empties", () => {
    expect(splitTranscript("  status  check\n now ")).toEqual(["status", "check", "now"]);
    expect(splitTranscript("")).toEqual([]);
  });

  it("gives a new word its own birth time and keeps older words as they were", () => {
    const first = advanceTranscriptWords([], ["status", "check"], 1_000);
    const next = advanceTranscriptWords(first, ["status", "check", "now"], 1_800);
    expect(next.map((word) => word.bornAt)).toEqual([1_000, 1_000, 1_800]);
    expect(next[0]).toBe(first[0]);
  });

  it("counts a revision when the pipeline corrects a word in place", () => {
    const first = advanceTranscriptWords([], ["witch", "threads"], 1_000);
    const next = advanceTranscriptWords(first, ["which", "threads"], 1_700);
    expect(next[0]).toMatchObject({ text: "which", revision: 1, bornAt: 1_000 });
    expect(next[1]).toBe(first[1]);
  });

  it("drops words the next partial no longer has", () => {
    const first = advanceTranscriptWords([], ["a", "b", "c"], 0);
    expect(advanceTranscriptWords(first, ["a"], 10).map((word) => word.text)).toEqual(["a"]);
  });

  it("settles a fresh word after a second and says when the next one will", () => {
    const words = advanceTranscriptWords([], ["a"], 1_000);
    expect(isFreshWord(words[0]!, 1_000 + FRESH_WORD_MS - 1)).toBe(true);
    expect(isFreshWord(words[0]!, 1_000 + FRESH_WORD_MS)).toBe(false);
    expect(nextSettleAt(words, 1_200)).toBe(1_000 + FRESH_WORD_MS);
    expect(nextSettleAt(words, 3_000)).toBeNull();
  });
});
