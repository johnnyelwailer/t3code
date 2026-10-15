import * as Cause from "effect/Cause";
import * as HttpClientError from "effect/http/HttpClientError";

const GENERIC_MESSAGE = "Cursor could not read usage limits.";

/**
 * Safe, user-facing reason a Cursor usage probe failed. Only the failure
 * class and HTTP status are named — never the credential or response body.
 */
export function describeCursorUsageFailure(error: unknown): string {
  if (Cause.isTimeoutError(error)) return "Cursor did not answer the usage request in time.";
  if (!HttpClientError.isHttpClientError(error)) return GENERIC_MESSAGE;
  const { reason } = error;
  if (reason._tag === "TransportError") return "Could not reach Cursor to read usage limits.";
  if (reason._tag !== "StatusCodeError") return GENERIC_MESSAGE;
  const { status } = reason.response;
  return status === 401 || status === 403
    ? "Cursor rejected the saved login (it may have expired). Run `agent login` to sign in again."
    : `Cursor usage request failed (HTTP ${status}).`;
}
