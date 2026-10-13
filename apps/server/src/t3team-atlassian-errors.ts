import * as Data from "effect/Data";

export class T3TeamAtlassianError extends Data.TaggedError("T3TeamAtlassianError")<{
  readonly message: string;
  /**
   * Machine-readable classification the client can branch on without parsing the message, e.g.
   * `jira_session_expired`. Absent for ordinary failures.
   */
  readonly code?: string;
  readonly cause?: unknown;
}> {}

/**
 * The account's Jira session is dead and the user must sign in again. The client turns this into
 * its "Your Jira session expired. Sign in again." state instead of a raw error.
 */
export const JIRA_SESSION_EXPIRED_CODE = "jira_session_expired";

/** Jira did not answer within the request timeout. */
export const JIRA_TIMEOUT_CODE = "jira_timeout";

export function toAtlassianError(message: string) {
  return (cause: unknown) =>
    new T3TeamAtlassianError({
      message: cause instanceof Error ? cause.message : message,
      cause,
    });
}
