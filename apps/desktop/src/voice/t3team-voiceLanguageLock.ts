/** Votes needed before an `auto` session picks its language; the tracker locks after two chunks. */
const LOCK_AFTER_VOTES = 2;

/**
 * Settles the language of a mixed-language speaker once: a configured language is locked from the
 * start, `auto` collects the detected language of the first transcripts and locks the majority.
 */
export function createLanguageLock(configured: string) {
  let locked: string | null = configured === "auto" ? null : configured;
  const votes = new Map<string, number>();
  let total = 0;

  return {
    /** What the next whisper pass should be told. */
    current: (): string => locked ?? "auto",
    locked: (): string | null => locked,
    /** Returns the language when this vote is the one that locks it. */
    vote(language: string | undefined): string | null {
      if (locked !== null || !language) return null;
      votes.set(language, (votes.get(language) ?? 0) + 1);
      total += 1;
      if (total < LOCK_AFTER_VOTES) return null;
      const [winner] = [...votes.entries()].reduce((best, entry) =>
        entry[1] > best[1] ? entry : best,
      );
      locked = winner ?? null;
      return locked;
    },
  };
}
