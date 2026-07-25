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

const FALLBACK_HEADLINE = "Something went wrong.";

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

  return withTechnical({ headline: FALLBACK_HEADLINE, canRetry: true });
}
