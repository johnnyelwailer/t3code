import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { classifyRejectedSession } from "./t3team-atlassian-auth-rejection.ts";
import {
  JIRA_SESSION_EXPIRED_CODE,
  JIRA_TIMEOUT_CODE,
  T3TeamAtlassianError,
  toAtlassianError,
} from "./t3team-atlassian-errors.ts";

export { JIRA_SESSION_EXPIRED_CODE, T3TeamAtlassianError, toAtlassianError };

export const ATLASSIAN_REQUEST_TIMEOUT_MS = 12_000;

const ATLASSIAN_REQUEST_TIMEOUT = Duration.millis(ATLASSIAN_REQUEST_TIMEOUT_MS);

function atlassianTimeoutError(message: string) {
  return new T3TeamAtlassianError({
    code: JIRA_TIMEOUT_CODE,
    message:
      `${message} Atlassian request timed out after ${ATLASSIAN_REQUEST_TIMEOUT_MS}ms. ` +
      "Check Jira auth and network connectivity.",
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
    }).pipe(Effect.catch(classifyRejectedSession)),
    Effect.sleep(ATLASSIAN_REQUEST_TIMEOUT).pipe(
      Effect.flatMap(() => Effect.fail(atlassianTimeoutError(message))),
    ),
  );
}

// No per-response CORS headers: upstream's global CORS layer (http.ts) owns that policy.
export function okJson(body: unknown) {
  return HttpServerResponse.jsonUnsafe(body, { status: 200 });
}

/**
 * For input the caller got wrong, as opposed to Atlassian failing us. Kept distinct from
 * `errorResponse` (502) so a malformed request is not reported to the user as an outage.
 */
export function badRequestJson(message: string) {
  return HttpServerResponse.jsonUnsafe({ error: message }, { status: 400 });
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
      { status: isSessionExpired ? 401 : 502 },
    ),
  );
}
