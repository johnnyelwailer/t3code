/**
 * Answer text for one question of a message-capability user-input request
 * (`runtime-request.respond` → the follow-up user message). Used by
 * `Orchestrator.ts` where upstream accepted only a string answer.
 *
 * - A string answer is trimmed.
 * - A multi-select answer (an array of option labels) is joined with " • ",
 *   so labels that contain commas stay unambiguous.
 * - Anything else, or an answer that is empty after trimming, is `null`
 *   ("not answered").
 */
const MULTI_SELECT_SEPARATOR = " • ";

export const t3teamUserInputAnswerText = (answer: unknown): string | null => {
  if (typeof answer === "string") {
    const trimmed = answer.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(answer)) return null;
  const labels = answer
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return labels.length > 0 ? labels.join(MULTI_SELECT_SEPARATOR) : null;
};
