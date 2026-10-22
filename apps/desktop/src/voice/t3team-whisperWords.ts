import type { WhisperWord } from "./t3team-whisperProtocol.ts";

/** whisper.cpp's own markers (`[_BEG_]`, `[_TT_150]`, …), never words. */
const SPECIAL_TOKEN = /^\s*\[_[A-Z0-9_]+\]\s*$/;

/**
 * With `maxLen: 1` whisper emits one segment per token. A token that starts with a space (or
 * the first one) opens a word; the others continue the previous word. Times are ms.
 */
export function joinTokenSegments(
  segments: ReadonlyArray<{ readonly text: string; readonly t0: number; readonly t1: number }>,
): WhisperWord[] {
  const words: Array<{ text: string; t0: number; t1: number }> = [];
  for (const segment of segments) {
    if (segment.text.trim() === "" || SPECIAL_TOKEN.test(segment.text)) continue;
    const last = words.at(-1);
    if (last === undefined || /^\s/.test(segment.text)) {
      words.push({ text: segment.text.trim(), t0: segment.t0, t1: segment.t1 });
    } else {
      last.text += segment.text;
      last.t1 = Math.max(last.t1, segment.t1);
    }
  }
  return words.filter((word) => word.text !== "");
}
