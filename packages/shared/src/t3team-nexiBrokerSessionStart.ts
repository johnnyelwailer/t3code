import type { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { failed } from "./t3team-nexiBrokerFailure.ts";

const StartedSession = Schema.Struct({ runId: Schema.String });

/**
 * Starts a plain cloud session through the broker's own dispatch, for a caller with no connected
 * machine (a phone alone). The session registers under this user and shows in the broker's session
 * list. The route is the broker's `POST /v1/sessions`; a broker without it answers 404, reported as
 * "not available yet" rather than as a generic refusal.
 */
export const makeStartSession =
  (
    config: { readonly url: string },
    http: HttpClient.HttpClient,
    accessToken: Effect.Effect<string, CloudSessionFailedError>,
  ) =>
  (input: { readonly durationSeconds: number }) =>
    Effect.gen(function* () {
      const token = yield* accessToken;
      const response = yield* http
        .execute(
          HttpClientRequest.post(`${config.url}/v1/sessions`).pipe(
            HttpClientRequest.bodyJsonUnsafe(input),
            HttpClientRequest.bearerToken(token),
          ),
        )
        .pipe(Effect.mapError(() => failed("The Nexi broker could not be reached (a session).")));
      if (response.status === 404 || response.status === 405) {
        return yield* failed("The Nexi broker cannot start cloud sessions on its own yet.");
      }
      if (response.status === 429) {
        return yield* failed("Too many cloud sessions are starting for you. Try again shortly.");
      }
      if (response.status >= 400) {
        return yield* failed(
          `The Nexi broker refused to start a session (HTTP ${response.status}).`,
          response.status,
        );
      }
      return yield* HttpClientResponse.schemaBodyJson(StartedSession)(response).pipe(
        Effect.map((body) => body.runId),
        Effect.mapError(() => failed("The Nexi broker answered a session start unexpectedly.")),
      );
    });
