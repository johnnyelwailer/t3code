/** `voice.transcriber.languages` as lower-case ISO 639-1 codes; empty means any language. */
export function parseAllowedLanguages(languages: string | undefined): readonly string[] {
  return (languages ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter((code) => /^[a-z]{2,3}$/.test(code));
}

/**
 * The Activity Tracker's `ScoreTranscript`: letters plus five per word. A pass forced into the
 * wrong language comes back short or empty, the right one comes back full.
 */
export function scoreTranscript(text: string): number {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  return letters + words * 5;
}

/**
 * Whether a pass needs re-running in the allowed languages: only an auto-detected language
 * outside a non-empty list. The text is never dropped for it, whatever the audio's length.
 */
export function languagesToRetry(input: {
  readonly requestedLanguage: string;
  readonly detectedLanguage: string | undefined;
  readonly allowedLanguages: readonly string[];
}): readonly string[] {
  const detected = input.detectedLanguage?.toLowerCase();
  if (input.requestedLanguage !== "auto" || input.allowedLanguages.length === 0) return [];
  if (detected === undefined || input.allowedLanguages.includes(detected)) return [];
  return input.allowedLanguages;
}

/** The best-scoring candidate; the first wins ties, as the tracker keeps its primary. */
export function pickBestTranscript<T extends { readonly text: string }>(
  candidates: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const candidate of candidates) {
    if (best === undefined || scoreTranscript(candidate.text) > scoreTranscript(best.text)) {
      best = candidate;
    }
  }
  return best;
}
