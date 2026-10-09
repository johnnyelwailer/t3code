import type { AccountDefinition } from "@t3team/pack-api";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

/**
 * The OAuth 2.0 public-client calls behind an account sign-in (`AccountDefinition`): device code
 * (RFC 8628), authorization code + PKCE (RFC 7636) for the browser sign-in
 * (`t3team-AccountBrowserSignIn`), and the refresh grant, redeemed per resource. Stateless —
 * `t3team-AccountSession` owns the state. Nothing here knows which issuer it talks to.
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

/** Why a refresh did not produce tokens: the grant is dead (sign in again) or the issuer is unreachable. */
export type RefreshFailure = "rejected" | "unreachable";

export const makeAccountOAuthClient = (account: AccountDefinition, http: HttpClient.HttpClient) => {
  const { issuer } = account;
  const scopeFor = (resource: string) =>
    `${account.resources[resource] ?? ""} ${account.baseScopes}`.trim();
  const signInScope = scopeFor(account.signInResource);
  const post = (url: string, params: Record<string, string>) =>
    HttpClientRequest.post(url).pipe(HttpClientRequest.bodyUrlParams(params), http.execute);

  return {
    /** `None` when the issuer offers no device-code grant. */
    requestDeviceCode: Option.fromNullishOr(issuer.deviceAuthorizationEndpoint).pipe(
      Option.map((endpoint) =>
        post(endpoint, { client_id: issuer.clientId, scope: signInScope }).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(DeviceCodeResponse)),
        ),
      ),
    ),

    /** Polls until the user approves; fails with a message the user can act on. */
    pollDeviceToken: (code: DeviceCode) =>
      Effect.gen(function* () {
        let interval = Duration.seconds(code.interval ?? 5);
        while (true) {
          yield* Effect.sleep(interval);
          const response = yield* post(issuer.tokenEndpoint, {
            grant_type: DEVICE_CODE_GRANT,
            client_id: issuer.clientId,
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

    /** The page the browser sign-in opens; the issuer redirects the code to `redirectUri`. */
    authorizeUrl: (input: { redirectUri: string; challenge: string; state: string }) => {
      const url = new URL(issuer.authorizationEndpoint);
      for (const [key, value] of Object.entries({
        client_id: issuer.clientId,
        response_type: "code",
        redirect_uri: input.redirectUri,
        response_mode: "query",
        scope: signInScope,
        state: input.state,
        code_challenge: input.challenge,
        code_challenge_method: "S256",
      })) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    },

    exchangeCode: (input: { code: string; verifier: string; redirectUri: string }) =>
      post(issuer.tokenEndpoint, {
        grant_type: "authorization_code",
        client_id: issuer.clientId,
        scope: signInScope,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      }).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
        Effect.mapError(() => "The browser sign-in was not accepted. Try again."),
      ),

    /** Redeems the grant for `resource`'s scope (the same grant serves every resource). */
    refresh: (refreshToken: string, resource: string): Effect.Effect<Tokens, RefreshFailure> =>
      post(issuer.tokenEndpoint, {
        grant_type: "refresh_token",
        client_id: issuer.clientId,
        scope: scopeFor(resource),
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

export type AccountOAuthClient = ReturnType<typeof makeAccountOAuthClient>;
