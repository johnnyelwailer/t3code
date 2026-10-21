export interface TranscriptWord {
  readonly text: string;
  /** When this slot first showed a word. */
  readonly bornAt: number;
  /** Counts in-place corrections of this slot; a new count replays the correction animation. */
  readonly revision: number;
}

/** How long a new word stays emphasized before it settles into the sentence. */
export const FRESH_WORD_MS = 1000;

export const splitTranscript = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/**
 * Carries the previous words into the next partial: a slot keeps its birth time while its word
 * stays, counts a revision when the pipeline changes the word in place, and a new slot is born.
 */
export function advanceTranscriptWords(
  previous: ReadonlyArray<TranscriptWord>,
  next: ReadonlyArray<string>,
  now: number,
): ReadonlyArray<TranscriptWord> {
  return next.map((text, index) => {
    const before = previous[index];
    if (before === undefined) return { text, bornAt: now, revision: 0 };
    return before.text === text ? before : { ...before, text, revision: before.revision + 1 };
  });
}

export const isFreshWord = (word: TranscriptWord, now: number): boolean =>
  now - word.bornAt < FRESH_WORD_MS;

/** The moment the earliest still-fresh word settles, or null when every word has. */
export function nextSettleAt(words: ReadonlyArray<TranscriptWord>, now: number): number | null {
  const fresh = words.filter((word) => isFreshWord(word, now));
  if (fresh.length === 0) return null;
  return Math.min(...fresh.map((word) => word.bornAt)) + FRESH_WORD_MS;
}
