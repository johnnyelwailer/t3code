/**
 * Whisper emits fluent text for silence and noise. Anything that reaches this gate becomes a user
 * message (or a voice-thread command), so known hallucinations are dropped instead of committed.
 */
const MIN_ALPHANUMERIC_CHARACTERS = 2;
const MAX_REPEATED_TOKEN_RUN = 5;

const NON_SPEECH_MARKERS = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+|♫+/g;

const HALLUCINATED_PHRASES = new Set([
  "thank you",
  "thanks",
  "thanks for watching",
  "thank you for watching",
  "thank you very much for watching",
  "thank you so much for watching",
  "please subscribe",
  "like and subscribe",
  "subscribe to my channel",
  "see you in the next video",
  "see you next time",
  "bye",
  "bye bye",
  "you",
  "vielen dank",
  "vielen dank fürs zuschauen",
  "danke fürs zuschauen",
  "danke",
  "tschüss",
  "bis zum nächsten mal",
  "merci",
  "merci d'avoir regardé cette vidéo",
  "sous-titres réalisés par la communauté d'amara.org",
  "gracias por ver el video",
  // Seen on room noise when auto-detection drifts to Portuguese, Spanish, Japanese or Russian.
  "e aí",
  "e ai",
  "obrigado",
  "obrigada",
  "tchau",
  "legendas pela comunidade amara.org",
  "ご視聴ありがとうございました",
  "продолжение следует",
  "субтитры сделал dimatorzok",
  "untertitel von stephanie geiges",
]);

const HALLUCINATED_FRAGMENTS = [
  "amara.org",
  "untertitel der amara",
  "untertitel im auftrag",
  "mooji.org",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/[.'-]+(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A phrase of 2-4 words said this many times in a row is a decoder loop, not speech. */
const MAX_REPEATED_PHRASE_RUN = 3;
const MAX_LOOP_PHRASE_WORDS = 4;

function isRepeatedTokenLoop(normalized: string): boolean {
  const tokens = normalized.split(" ");
  let run = 1;
  for (let index = 1; index < tokens.length; index += 1) {
    run = tokens[index] === tokens[index - 1] ? run + 1 : 1;
    if (run >= MAX_REPEATED_TOKEN_RUN) return true;
  }
  return isRepeatedPhraseLoop(tokens);
}

/** `e aí e aí e aí …`: the same short phrase back to back, the classic whisper loop on noise. */
function isRepeatedPhraseLoop(tokens: readonly string[]): boolean {
  for (let size = 2; size <= MAX_LOOP_PHRASE_WORDS; size += 1) {
    for (let start = 0; start + size * MAX_REPEATED_PHRASE_RUN <= tokens.length; start += 1) {
      let runs = 1;
      for (let next = start + size; next + size <= tokens.length; next += size) {
        let same = true;
        for (let offset = 0; offset < size; offset += 1) {
          if (tokens[next + offset] !== tokens[start + offset]) {
            same = false;
            break;
          }
        }
        if (!same) break;
        runs += 1;
      }
      if (runs >= MAX_REPEATED_PHRASE_RUN) return true;
    }
  }
  return false;
}

/** Returns the speech to commit, or "" when the transcript is no-speech or a known hallucination. */
export function sanitizeTranscript(raw: string): string {
  const withoutMarkers = raw.replace(NON_SPEECH_MARKERS, " ").replace(/\s+/g, " ").trim();
  const normalized = normalize(withoutMarkers);
  const alphanumeric = normalized.replace(/[^\p{L}\p{N}]/gu, "");
  if (alphanumeric.length < MIN_ALPHANUMERIC_CHARACTERS) return "";
  if (HALLUCINATED_PHRASES.has(normalized)) return "";
  if (HALLUCINATED_FRAGMENTS.some((fragment) => normalized.includes(fragment))) return "";
  if (isRepeatedTokenLoop(normalized)) return "";
  return withoutMarkers;
}
