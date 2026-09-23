import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { browserApiCorsHeaders } from "./httpCors.ts";

export const ATLASSIAN_REQUEST_TIMEOUT_MS = 12_000;

const ATLASSIAN_REQUEST_TIMEOUT = Duration.millis(ATLASSIAN_REQUEST_TIMEOUT_MS);

function atlassianTimeoutError(message: string) {
  return new T3TeamAtlassianError({
    message:
      `${message} Atlassian request timed out after ${ATLASSIAN_REQUEST_TIMEOUT_MS}ms. ` +
      "Check Jira auth and network connectivity.",
  });
}

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
 * The server dropped the account's dead refresh token and the user must sign in again. The client
 * turns this into its "Your Jira session expired. Sign in again." state instead of a raw error.
 */
export const JIRA_SESSION_EXPIRED_CODE = "jira_session_expired";

export function toAtlassianError(message: string) {
  return (cause: unknown) =>
    new T3TeamAtlassianError({
      message: cause instanceof Error ? cause.message : message,
      cause,
    });
}

export function readJsonBody<T>() {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    return (yield* request.json.pipe(
      Effect.mapError(toAtlassianError("Invalid Atlassian request.")),
    )) as T;
  });
}

export function tryAtlassianPromise<T>(thunk: () => Promise<T>, message: string) {
  return Effect.raceFirst(
    Effect.tryPromise({
      try: thunk,
      catch: toAtlassianError(message),
    }),
    Effect.sleep(ATLASSIAN_REQUEST_TIMEOUT).pipe(
      Effect.flatMap(() => Effect.fail(atlassianTimeoutError(message))),
    ),
  );
}

export function okJson(body: unknown) {
  return HttpServerResponse.jsonUnsafe(body, { status: 200, headers: browserApiCorsHeaders });
}

/**
 * For input the caller got wrong, as opposed to Atlassian failing us. Kept distinct from
 * `errorResponse` (502) so a malformed request is not reported to the user as an outage.
 */
export function badRequestJson(message: string) {
  return HttpServerResponse.jsonUnsafe(
    { error: message },
    { status: 400, headers: browserApiCorsHeaders },
  );
}

export function errorResponse(error: unknown) {
  const isSessionExpired =
    error instanceof T3TeamAtlassianError && error.code === JIRA_SESSION_EXPIRED_CODE;
  const message =
    error instanceof T3TeamAtlassianError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Atlassian request failed.";
  return Effect.succeed(
    HttpServerResponse.jsonUnsafe(
      isSessionExpired ? { error: message, code: JIRA_SESSION_EXPIRED_CODE } : { error: message },
      // 401 rather than 502: the upstream is fine, this account's session is what is dead.
      { status: isSessionExpired ? 401 : 502, headers: browserApiCorsHeaders },
    ),
  );
}
