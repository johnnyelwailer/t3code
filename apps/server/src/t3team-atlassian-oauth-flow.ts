import * as NodeCrypto from "node:crypto";

import { buildAuthorizeUrl, generatePkce } from "@t3tools/integrations-atlassian";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { T3TeamAtlassianError, tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import {
  ATLASSIAN_OAUTH_FLOW_TTL_MS,
  putPendingAtlassianOAuthFlow,
  readPendingAtlassianOAuthFlow,
} from "./t3team-atlassian-oauth-flowStore.ts";
import {
  ATLASSIAN_OAUTH_ENV_HINT,
  readAtlassianOAuthClientId,
} from "./t3team-atlassian-oauthEnv.ts";

export { completeAtlassianOAuthFlow } from "./t3team-atlassian-oauth-flowComplete.ts";

export const ATLASSIAN_OAUTH_BEGIN_ROUTE = "/api/t3team/atlassian/oauth/begin";

export type AtlassianOAuthBeginResult = {
  readonly state: string;
  readonly authorizeUrl: string;
  /** Origin-relative, so the caller can build a link on whichever origin it can actually share. */
  readonly beginPath: string;
  readonly expiresAtMs: number;
};

/**
 * 128 bits from the CSPRNG, hex so it is safe in a path segment. `state` is the whole capability to
 * finish this sign-in, so it has to be unguessable rather than merely unique — a UUID would do, but
 * nothing derived from time or a counter would.
 */
function newFlowState(): string {
  return NodeCrypto.randomBytes(16).toString("hex");
}

function requiredClientId(): string {
  const clientId = readAtlassianOAuthClientId();
  if (!clientId) {
    throw new Error(
      `Atlassian OAuth is not configured. Set ${ATLASSIAN_OAUTH_ENV_HINT} on the server.`,
    );
  }
  return clientId;
}

/**
 * Start a flow the server owns end to end.
 *
 * `redirectUri` comes from the caller because it is registered in the Atlassian Developer Console
 * against the web origin, which the server cannot infer in dev (the SPA is on the Vite port). It is
 * only ever used as an OAuth parameter and in the token exchange — never as a redirect target of
 * ours — and Atlassian rejects any value that is not registered, so a bad one fails at sign-in.
 */
export function beginAtlassianOAuthFlow(input: { readonly redirectUri: string }) {
  return Effect.gen(function* () {
    const redirectUri = input.redirectUri.trim();
    if (!redirectUri) {
      return yield* new T3TeamAtlassianError({
        message: "Atlassian OAuth redirect URI is missing from the request.",
      });
    }

    const clientId = yield* Effect.try({
      try: requiredClientId,
      catch: (cause) =>
        new T3TeamAtlassianError({
          message: cause instanceof Error ? cause.message : "Atlassian OAuth is not configured.",
          cause,
        }),
    });

    const pkce = yield* tryAtlassianPromise(
      () => generatePkce(),
      "Failed to prepare the Atlassian sign-in request.",
    );
    const state = newFlowState();
    const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri }, pkce, state);
    const createdAtMs = yield* Clock.currentTimeMillis;

    // The verifier stops here. Handing it to a browser would make the `state` alone enough to
    // redeem a code from anywhere, which is exactly the property the server is here to keep.
    putPendingAtlassianOAuthFlow(
      { state, codeVerifier: pkce.codeVerifier, authorizeUrl, redirectUri, createdAtMs },
      createdAtMs,
    );

    return {
      state,
      authorizeUrl,
      beginPath: `${ATLASSIAN_OAUTH_BEGIN_ROUTE}/${state}`,
      expiresAtMs: createdAtMs + ATLASSIAN_OAUTH_FLOW_TTL_MS,
    } satisfies AtlassianOAuthBeginResult;
  });
}

/**
 * The authorize URL to send a visitor of `begin/:state` to, or `undefined` when the state is
 * unknown or expired.
 *
 * This returns a stored URL the server built itself — never anything read off the request — so the
 * redirect cannot be steered anywhere but `auth.atlassian.com`. That is the whole defence against
 * this becoming an open redirect, and it is why the authorize URL is stored rather than rebuilt from
 * query parameters.
 */
export function resolveAtlassianOAuthAuthorizeUrl(state: string) {
  return Effect.gen(function* () {
    const nowMs = yield* Clock.currentTimeMillis;
    return readPendingAtlassianOAuthFlow(state, nowMs)?.authorizeUrl;
  });
}
