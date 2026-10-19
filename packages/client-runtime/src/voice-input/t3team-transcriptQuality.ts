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

function isRepeatedTokenLoop(normalized: string): boolean {
  const tokens = normalized.split(" ");
  let run = 1;
  for (let index = 1; index < tokens.length; index += 1) {
    run = tokens[index] === tokens[index - 1] ? run + 1 : 1;
    if (run >= MAX_REPEATED_TOKEN_RUN) return true;
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
