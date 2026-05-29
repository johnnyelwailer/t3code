import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { browserApiCorsHeaders } from "./httpCors.ts";

export const ATLASSIAN_REQUEST_TIMEOUT_MS = 12_000;

const ATLASSIAN_REQUEST_TIMEOUT = Duration.millis(ATLASSIAN_REQUEST_TIMEOUT_MS);

function atlassianTimeoutError(message: string) {
  return new T3workAtlassianError({
    message:
      `${message} Atlassian request timed out after ${ATLASSIAN_REQUEST_TIMEOUT_MS}ms. ` +
      "Check Jira auth and network connectivity.",
  });
}

export class T3workAtlassianError extends Data.TaggedError("T3workAtlassianError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export function toAtlassianError(message: string) {
  return (cause: unknown) =>
    new T3workAtlassianError({
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

export function errorResponse(error: unknown) {
  const message =
    error instanceof T3workAtlassianError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Atlassian request failed.";
  return Effect.succeed(
    HttpServerResponse.jsonUnsafe(
      { error: message },
      { status: 502, headers: browserApiCorsHeaders },
    ),
  );
}
