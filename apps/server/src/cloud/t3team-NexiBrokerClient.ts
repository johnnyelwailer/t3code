import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import type { NexiBrokerConfig } from "./t3team-NexiBrokerConfig.ts";

/**
 * The broker's v1 HTTP API (distribution `services/nexi-broker`), called with the user's account
 * access token. Grants go into the session workflow's inputs; pairing credentials are minted by the
 * VM's own server on demand and are one-time.
 */

const GrantResponse = Schema.Struct({ grant: Schema.String });
const PairingResponse = Schema.Struct({ credential: Schema.String });
const BrokerSession = Schema.Struct({
  runId: Schema.String,
  environmentId: Schema.optional(Schema.NullOr(Schema.String)),
  label: Schema.optional(Schema.NullOr(Schema.String)),
});
export type BrokerSession = typeof BrokerSession.Type;
const SessionsResponse = Schema.Struct({ sessions: Schema.Array(BrokerSession) });

const failed = (message: string, status?: number) =>
  new CloudSessionFailedError({
    reason: status === 401 ? "broker_sign_in_required" : "broker_unavailable",
    message: status === 401 ? "Your sign-in was not accepted. Sign in again." : message,
  });

export const makeNexiBrokerClient = Effect.fn("cloud.broker.client.make")(function* (
  config: NexiBrokerConfig,
  accessToken: Effect.Effect<string, CloudSessionFailedError>,
) {
  const http = yield* HttpClient.HttpClient;

  const call = <A, I>(
    request: HttpClientRequest.HttpClientRequest,
    schema: Schema.Codec<A, I>,
    what: string,
  ) =>
    Effect.gen(function* () {
      const token = yield* accessToken;
      const response = yield* http
        .execute(request.pipe(HttpClientRequest.bearerToken(token)))
        .pipe(Effect.mapError(() => failed(`The Nexi broker could not be reached (${what}).`)));
      if (response.status >= 400) {
        const body = yield* response.json.pipe(Effect.orElseSucceed(() => ({})));
        const reason =
          typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : `HTTP ${response.status}`;
        return yield* failed(`The Nexi broker refused ${what}: ${reason}.`, response.status);
      }
      return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError(() => failed(`The Nexi broker answered ${what} unexpectedly.`)),
      );
    });

  return {
    /** A grant for the next dispatch, redeemable only by a run the given GHE login dispatched. */
    requestGrant: (gheLogin: string, secrets?: Readonly<Record<string, string>>) =>
      call(
        HttpClientRequest.post(`${config.url}/v1/grants`).pipe(
          HttpClientRequest.bodyJsonUnsafe({ gheLogin, ...(secrets ? { secrets } : {}) }),
        ),
        GrantResponse,
        "the session grant",
      ).pipe(Effect.map((body) => body.grant)),
    listSessions: call(
      HttpClientRequest.get(`${config.url}/v1/sessions`),
      SessionsResponse,
      "the session list",
    ).pipe(Effect.map((body) => body.sessions)),
    mintPairing: (runId: string) =>
      call(
        HttpClientRequest.post(`${config.url}/v1/sessions/${encodeURIComponent(runId)}/pairing`),
        PairingResponse,
        "a pairing credential",
      ).pipe(Effect.map((body) => body.credential)),
  } as const;
});

export type NexiBrokerClient = Effect.Success<ReturnType<typeof makeNexiBrokerClient>>;
