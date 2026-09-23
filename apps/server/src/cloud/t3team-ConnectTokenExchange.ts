import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { connectLoopbackRedirectUri } from "@t3tools/shared/connectAuth";

import type { CloudCliOAuthConfig } from "./publicConfig.ts";
import type { PersistedToken } from "./CliTokenManager.ts";

/**
 * The OAuth token response the connect token endpoint answers with. Same shape
 * as the CLI's — the exchange here intentionally mirrors
 * `CliTokenManager.exchangeToken` (a module-private function in an
 * upstream-guarded file), down to the best-effort id_token identity claim, so
 * in-app minted credentials are indistinguishable from CLI minted ones. Keep
 * the two in sync if the token response shape moves.
 */
const OAuthTokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.optional(Schema.String),
  id_token: Schema.optional(Schema.String),
  expires_in: Schema.Number,
  token_type: Schema.String,
});

const OidcIdentityClaimsJson = Schema.fromJsonString(
  Schema.Struct({
    email: Schema.optional(Schema.String),
    preferred_username: Schema.optional(Schema.String),
    sub: Schema.optional(Schema.String),
  }),
);
const decodeOidcIdentityClaimsJson = Schema.decodeUnknownOption(OidcIdentityClaimsJson);

/**
 * Best-effort read of the `email` (or fallback) claim from an OIDC id_token —
 * the display identity only; a malformed token degrades to "no identity".
 */
function idTokenIdentity(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  const decoded = Encoding.decodeBase64UrlString(payload);
  if (decoded._tag !== "Success") return null;
  const claims = decodeOidcIdentityClaimsJson(decoded.success);
  if (Option.isNone(claims)) return null;
  for (const value of [claims.value.email, claims.value.preferred_username, claims.value.sub]) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/**
 * Exchange the loopback authorization code for a full credential (including
 * the refresh token the VM keeps refreshing against).
 *
 * The `redirect_uri` must be the loopback one the code was issued for — the
 * connect service rejects an exchange that names a different redirect — so
 * unlike the out-of-band exchange this never uses the hosted callback URL.
 */
export const exchangeLoopbackAuthorizationCode = Effect.fn(
  "cloud.connect.exchange_loopback_authorization_code",
)(function* (input: {
  readonly metadata: Pick<CloudCliOAuthConfig, "tokenEndpoint" | "clientId" | "loopbackPort">;
  readonly code: string;
  readonly codeVerifier: string;
}) {
  const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const response = yield* HttpClientRequest.post(input.metadata.tokenEndpoint).pipe(
    HttpClientRequest.bodyUrlParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: connectLoopbackRedirectUri(input.metadata.loopbackPort),
      client_id: input.metadata.clientId,
      code_verifier: input.codeVerifier,
    }),
    httpClient.execute,
    Effect.flatMap(HttpClientResponse.schemaBodyJson(OAuthTokenResponse)),
  );
  const now = yield* Clock.currentTimeMillis;
  const identity = idTokenIdentity(response.id_token);
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? "",
    expiresAtEpochMs: now + response.expires_in * 1_000,
    ...(identity === null ? {} : { identity }),
  } satisfies PersistedToken;
});
