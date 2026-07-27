import {
  classifyJiraFieldError,
  classifyMessage,
  classifyStatus,
  classifyTitleDescription,
  extractTechnical,
  readMessage,
  readStatus,
  type T3TeamErrorClassification,
} from "./t3team-errorMessageRules";

/** A plain, human sentence rendering of an error, for the t3team error surface. */
export type T3TeamUserFacingError = {
  readonly headline: string;
  readonly detail?: string;
  readonly technical?: string;
  readonly canRetry: boolean;
};

/**
 * The unclassified case.
 *
 * Callers say what they were doing, so the headline says it too — "Something went wrong." tells the
 * reader nothing they had not already deduced from the empty page.
 *
 * `action` must be a gerund phrase ("loading assignees", "updating linked repositories"); it is
 * capitalised and suffixed with "failed". Call sites used to mix gerunds with infinitives, which
 * produced "Couldn't loading assignees" under the previous phrasing — one grammatical form is the
 * price of composing the sentence here rather than at every call site.
 */
function fallbackHeadline(action: string | undefined): string {
  if (!action) return "Something went wrong.";
  return `${action.charAt(0).toUpperCase()}${action.slice(1)} failed.`;
}

function buildTechnical(error: unknown, action: string | undefined): string | undefined {
  const raw = extractTechnical(error);
  if (!action) return raw;
  const prefix = `Action: ${action}`;
  return raw ? `${prefix}\n${raw}` : prefix;
}

/**
 * Maps any thrown/caught value to a short, plain-language error the user can act on.
 * `technical` always carries the original message (plus stack, when available) so
 * engineers can still see what actually happened, even when a friendly rule matched.
 */
export function toUserFacingError(
  error: unknown,
  context?: { readonly action?: string },
): T3TeamUserFacingError {
  const technical = buildTechnical(error, context?.action);
  const withTechnical = (result: T3TeamErrorClassification): T3TeamUserFacingError => ({
    headline: result.headline,
    ...(result.detail ? { detail: result.detail } : {}),
    canRetry: result.canRetry,
    ...(technical ? { technical } : {}),
  });

  const jiraFieldError = classifyJiraFieldError(error);
  if (jiraFieldError) return withTechnical(jiraFieldError);

  const titleDescription = classifyTitleDescription(error);
  if (titleDescription) return withTechnical(titleDescription);

  const status = readStatus(error);
  const message = readMessage(error);
  const matched = classifyStatus(status) ?? (message ? classifyMessage(message) : null);
  if (matched) return withTechnical(matched);

  return withTechnical({ headline: fallbackHeadline(context?.action), canRetry: true });
}
