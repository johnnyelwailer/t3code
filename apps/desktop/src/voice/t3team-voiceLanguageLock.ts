/**
 * A vote from a partial whose window held less speech than this is ignored: whisper.cpp detects
 * the language from the first seconds of audio, and on one to two seconds it confuses close
 * relatives (German and Dutch above all), so such a vote must not decide a lock.
 */
export const MIN_VOTE_AUDIO_MS = 3_000;
/** Past this much audio the recording stops waiting for agreement and settles with what it has. */
export const VOTE_DEADLINE_MS = 8_000;
/** Votes one language needs before it can lock. */
const MIN_AGREEING_VOTES = 2;

export type LanguageVoteOutcome =
  | { readonly kind: "pending" }
  | { readonly kind: "locked"; readonly language: string }
  | { readonly kind: "kept-auto" };

const PENDING: LanguageVoteOutcome = { kind: "pending" };

function pinnedLanguage(configured: string): string | null {
  const language = configured.trim().toLowerCase();
  return language === "" || language === "auto" ? null : language;
}

/**
 * Settles the language of ONE recording; the stream session makes a fresh lock per recording, so
 * nothing carries over to the next one. A concrete `voice.transcriber.language` is a hard pin: it
 * is the language from the first pass and nothing votes. `auto` runs every partial with
 * auto-detection and collects the detected language of each partial that covered at least
 * `MIN_VOTE_AUDIO_MS` of speech. The first language to gather two votes and lead outright locks;
 * disagreeing votes keep collecting until the recording passes `VOTE_DEADLINE_MS`, where the
 * recording settles on the majority, or stays on auto-detection when the votes tie or too few
 * arrived. A recording that never reaches enough speech stays on auto-detection throughout.
 */
export function createLanguageLock(configured: string) {
  const pin = pinnedLanguage(configured);
  let locked: string | null = pin;
  let settled = pin !== null;
  const votes = new Map<string, number>();

  return {
    /** What the next whisper pass should be told. */
    current: (): string => locked ?? "auto",
    locked: (): string | null => locked,
    pinned: pin !== null,
    /** `audioMs` is the speech the voting partial covered. */
    vote(language: string | undefined, audioMs: number): LanguageVoteOutcome {
      const detected = language?.trim().toLowerCase();
      if (settled || !detected || audioMs < MIN_VOTE_AUDIO_MS) return PENDING;
      votes.set(detected, (votes.get(detected) ?? 0) + 1);
      const [leader, runnerUp] = [...votes.entries()].toSorted((a, b) => b[1] - a[1]);
      const leads =
        leader !== undefined && leader[1] >= MIN_AGREEING_VOTES && leader[1] > (runnerUp?.[1] ?? 0);
      if (!leads && audioMs < VOTE_DEADLINE_MS) return PENDING;
      settled = true;
      if (!leads || leader === undefined) return { kind: "kept-auto" };
      locked = leader[0];
      return { kind: "locked", language: leader[0] };
    },
  };
}
