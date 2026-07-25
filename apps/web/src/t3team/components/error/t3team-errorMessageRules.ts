/**
 * Pattern matching and shape extraction helpers backing `t3team-errorMessage.ts`.
 * Split out to keep the entry point under the additive-guard line cap.
 */

export type T3TeamErrorClassification = {
  readonly headline: string;
  readonly detail?: string;
  readonly canRetry: boolean;
};

const NETWORK_PATTERN = /failed to fetch|network ?error|no network connection|\boffline\b/i;
const TIMEOUT_PATTERN = /timed out|timeout|\babort(ed)?\b/i;
const AUTH_PATTERN = /\b401\b|\b403\b|unauthorized|forbidden|permission/i;
const NOT_FOUND_PATTERN = /\b404\b|not found/i;
const RATE_LIMIT_PATTERN = /\b429\b|rate limit/i;
const SERVER_ERROR_PATTERN = /\b5\d{2}\b|internal server error|internal error/i;
const ATLASSIAN_OAUTH_UNCONFIGURED_PATTERN = /atlassian oauth is not configured/i;
const SIGNIN_LINK_EXPIRED_PATTERN = /sign-?in link expired/i;

/**
 * Synthetic error passed to `T3TeamErrorState` when no Atlassian OAuth client is configured,
 * so the wizard's unconfigured-state UI can reuse the shared error surface (and this rule's
 * copy) instead of inventing its own layout.
 */
export const ATLASSIAN_OAUTH_UNCONFIGURED_ERROR = new Error(
  "Atlassian OAuth is not configured for this environment.",
);

const ATLASSIAN_OAUTH_UNCONFIGURED_RESULT: T3TeamErrorClassification = {
  headline: "Atlassian OAuth isn't configured yet.",
  detail:
    "Set T3TEAM_ATLASSIAN_CLIENT_ID and T3TEAM_ATLASSIAN_CLIENT_SECRET on the server, then restart it. Until then, connect with an API token below.",
  canRetry: false,
};

/**
 * An expired sign-in wait is not "that took too long" — the server has forgotten the pending flow at
 * the same moment, so the only thing that helps is starting again for a fresh link.
 */
const SIGNIN_LINK_EXPIRED_RESULT: T3TeamErrorClassification = {
  headline: "The sign-in link expired.",
  detail: "Start the Atlassian connection again to get a fresh link.",
  canRetry: true,
};

const NETWORK_RESULT: T3TeamErrorClassification = {
  headline: "You appear to be offline.",
  canRetry: true,
};
const TIMEOUT_RESULT: T3TeamErrorClassification = {
  headline: "That took too long.",
  canRetry: true,
};
const AUTH_RESULT: T3TeamErrorClassification = {
  headline: "You don't have access to this.",
  canRetry: false,
};
const NOT_FOUND_RESULT: T3TeamErrorClassification = {
  headline: "This isn't available anymore.",
  canRetry: false,
};
const RATE_LIMIT_RESULT: T3TeamErrorClassification = {
  headline: "Too many requests just now. Try again in a moment.",
  canRetry: true,
};
const SERVER_ERROR_RESULT: T3TeamErrorClassification = {
  headline: "Something went wrong on our end.",
  canRetry: true,
};

/** Status-code based classification, checked before message text matching. */
export function classifyStatus(status: number | undefined): T3TeamErrorClassification | null {
  if (status === undefined) return null;
  if (status === 401 || status === 403) return AUTH_RESULT;
  if (status === 404) return NOT_FOUND_RESULT;
  if (status === 429) return RATE_LIMIT_RESULT;
  if (status >= 500 && status < 600) return SERVER_ERROR_RESULT;
  return null;
}

/** Free-text classification for messages that don't carry a structured status. */
export function classifyMessage(message: string): T3TeamErrorClassification | null {
  if (ATLASSIAN_OAUTH_UNCONFIGURED_PATTERN.test(message)) {
    return ATLASSIAN_OAUTH_UNCONFIGURED_RESULT;
  }
  if (SIGNIN_LINK_EXPIRED_PATTERN.test(message)) return SIGNIN_LINK_EXPIRED_RESULT;
  if (NETWORK_PATTERN.test(message)) return NETWORK_RESULT;
  if (TIMEOUT_PATTERN.test(message)) return TIMEOUT_RESULT;
  if (AUTH_PATTERN.test(message)) return AUTH_RESULT;
  if (NOT_FOUND_PATTERN.test(message)) return NOT_FOUND_RESULT;
  if (RATE_LIMIT_PATTERN.test(message)) return RATE_LIMIT_RESULT;
  if (SERVER_ERROR_PATTERN.test(message)) return SERVER_ERROR_RESULT;
  return null;
}

type JiraFieldErrorShape = {
  readonly errorMessages?: ReadonlyArray<string>;
  readonly errors?: Readonly<Record<string, string>>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function isJiraFieldErrorShape(value: unknown): value is JiraFieldErrorShape {
  const record = asRecord(value);
  if (!record) return false;
  const messages = record.errorMessages;
  const hasMessages =
    Array.isArray(messages) && messages.length > 0 && messages.every((m) => typeof m === "string");
  const errors = record.errors;
  const hasErrors =
    typeof errors === "object" &&
    errors !== null &&
    !Array.isArray(errors) &&
    Object.keys(errors).length > 0;
  return hasMessages || hasErrors;
}

/** Atlassian issue update rejections: `{ errorMessages: [...], errors: { field: msg } }`. */
export function classifyJiraFieldError(value: unknown): T3TeamErrorClassification | null {
  const record = asRecord(value);
  const shape = isJiraFieldErrorShape(value)
    ? (value as JiraFieldErrorShape)
    : isJiraFieldErrorShape(record?.cause)
      ? (record?.cause as JiraFieldErrorShape)
      : null;
  if (!shape) return null;

  const lines = [
    ...(shape.errorMessages ?? []),
    ...Object.entries(shape.errors ?? {}).map(([field, message]) => `${field}: ${message}`),
  ];
  return { headline: "Jira rejected the change.", detail: lines.join("\n"), canRetry: false };
}

/** Already-formatted `{ title, description }` errors (e.g. kanban move failures) pass through. */
export function classifyTitleDescription(value: unknown): T3TeamErrorClassification | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.title !== "string" || typeof record.description !== "string") return null;
  return { headline: record.title, detail: record.description, canRetry: true };
}

export function readStatus(value: unknown): number | undefined {
  const record = asRecord(value);
  const status = record?.status;
  return typeof status === "number" ? status : undefined;
}

export function readMessage(value: unknown): string | undefined {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.message === "string") return record.message;
  if (typeof record.status === "number") {
    return typeof record.statusText === "string"
      ? `HTTP ${record.status} ${record.statusText}`
      : `HTTP ${record.status}`;
  }
  return undefined;
}

export function extractTechnical(value: unknown): string | undefined {
  if (value instanceof Error) {
    return value.stack ? `${value.message}\n\n${value.stack}` : value.message;
  }
  const message = readMessage(value);
  if (message) return message;
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
