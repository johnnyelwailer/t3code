import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import type { NexiBrokerConfig } from "./t3team-NexiBrokerConfig.ts";

/**
 * The Entra (Microsoft identity platform v2) calls behind the Nexi broker sign-in: OAuth device
 * code (RFC 8628), the authorization-code + PKCE grant for the browser sign-in
 * (`t3team-NexiBrokerBrowserSignIn`), and the refresh grant. Stateless — `t3team-NexiBrokerAuth`
 * owns the state.
 */

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SLOW_DOWN = Duration.seconds(5);

export const DeviceCodeResponse = Schema.Struct({
  device_code: Schema.String,
  user_code: Schema.String,
  verification_uri: Schema.String,
  expires_in: Schema.Number,
  interval: Schema.optional(Schema.Number),
});
export type DeviceCode = typeof DeviceCodeResponse.Type;
export const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
});
export type Tokens = typeof TokenResponse.Type;
const ErrorResponse = Schema.Struct({
  error: Schema.String,
  error_description: Schema.optional(Schema.String),
});

/** Why a refresh did not produce tokens: the grant is dead (sign in again) or Entra is unreachable. */
export type RefreshFailure = "rejected" | "unreachable";

export const makeEntraClient = (config: NexiBrokerConfig, http: HttpClient.HttpClient) => {
  const endpoint = (path: "devicecode" | "token" | "authorize") =>
    `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/${path}`;
  const scope = `api://${config.app}/relay.access openid profile offline_access`;
  const post = (url: string, params: Record<string, string>) =>
    HttpClientRequest.post(url).pipe(HttpClientRequest.bodyUrlParams(params), http.execute);

  return {
    scope,
    requestDeviceCode: post(endpoint("devicecode"), { client_id: config.app, scope }).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(DeviceCodeResponse)),
    ),

    /** Polls until the user approves; fails with a message the user can act on. */
    pollDeviceToken: (code: DeviceCode) =>
      Effect.gen(function* () {
        let interval = Duration.seconds(code.interval ?? 5);
        while (true) {
          yield* Effect.sleep(interval);
          const response = yield* post(endpoint("token"), {
            grant_type: DEVICE_CODE_GRANT,
            client_id: config.app,
            device_code: code.device_code,
          }).pipe(Effect.option);
          // Transport failures and 5xx are transient while the code is still valid.
          if (Option.isNone(response) || response.value.status >= 500) continue;
          if (response.value.status < 300) {
            return yield* HttpClientResponse.schemaBodyJson(TokenResponse)(response.value);
          }
          const failure = yield* HttpClientResponse.schemaBodyJson(ErrorResponse)(response.value);
          if (failure.error === "authorization_pending") continue;
          if (failure.error === "slow_down") {
            interval = Duration.sum(interval, SLOW_DOWN);
            continue;
          }
          return yield* Effect.fail(
            failure.error === "expired_token"
              ? "The sign-in code expired. Start again."
              : "The sign-in was declined.",
          );
        }
      }).pipe(
        Effect.timeout(Duration.seconds(code.expires_in)),
        Effect.mapError((error) =>
          typeof error === "string" ? error : "The sign-in code expired. Start again.",
        ),
      ),

    /** The page the browser sign-in opens; Entra redirects the code to `redirectUri`. */
    authorizeUrl: (input: { redirectUri: string; challenge: string; state: string }) => {
      const url = new URL(endpoint("authorize"));
      for (const [key, value] of Object.entries({
        client_id: config.app,
        response_type: "code",
        redirect_uri: input.redirectUri,
        response_mode: "query",
        scope,
        state: input.state,
        code_challenge: input.challenge,
        code_challenge_method: "S256",
      })) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    },

    exchangeCode: (input: { code: string; verifier: string; redirectUri: string }) =>
      post(endpoint("token"), {
        grant_type: "authorization_code",
        client_id: config.app,
        scope,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      }).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
        Effect.mapError(() => "Microsoft did not accept the browser sign-in. Try again."),
      ),

    refresh: (refreshToken: string): Effect.Effect<Tokens, RefreshFailure> =>
      post(endpoint("token"), {
        grant_type: "refresh_token",
        client_id: config.app,
        scope,
        refresh_token: refreshToken,
      }).pipe(
        Effect.mapError((): RefreshFailure => "unreachable"),
        Effect.flatMap((response) =>
          response.status >= 400 && response.status < 500
            ? Effect.fail<RefreshFailure>("rejected")
            : HttpClientResponse.filterStatusOk(response).pipe(
                Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
                Effect.mapError((): RefreshFailure => "unreachable"),
              ),
        ),
      ),
  };
};
