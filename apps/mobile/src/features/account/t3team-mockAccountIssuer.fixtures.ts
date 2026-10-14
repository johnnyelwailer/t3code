import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { nexploreAccount, type MobileAccountDefinition } from "./t3team-accountIssuer";
import type { AccountSecretStorage } from "./t3team-accountTokenStore";

/**
 * An in-memory OAuth 2.0 issuer speaking the Entra ID v2 wire format: device code (RFC 8628),
 * authorization code + PKCE (RFC 7636, S256 verified) and rotating refresh grants. It proves the
 * app's sign-in end to end without a live tenant; `authorize` stands in for the user on the
 * issuer's page.
 */

const ORIGIN = "https://issuer.mock.test";
export const MOCK_CLIENT_ID = "00000000-0000-4000-8000-000000000001";
export const MOCK_USER_CODE = "MOCK-CODE";
export const MOCK_VERIFICATION_URI = `${ORIGIN}/devicelogin`;

type DeviceDecision = "pending" | "approved" | "declined" | "expired";
const DEVICE_ERRORS = {
  pending: "authorization_pending",
  declined: "authorization_declined",
  expired: "expired_token",
} satisfies Record<Exclude<DeviceDecision, "approved">, string>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const s256 = async (verifier: string) =>
  base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );

/** An unsigned JWT: the app only reads the display name; the resource server verifies tokens. */
const accessTokenFor = (scope: string, name: string, serial: number) =>
  [
    base64Url(new TextEncoder().encode(JSON.stringify({ alg: "none" }))),
    base64Url(new TextEncoder().encode(JSON.stringify({ name, scp: scope, jti: serial }))),
    "",
  ].join(".");

export function makeMockAccountIssuer(
  options: {
    readonly name?: string;
    readonly interval?: number;
    readonly expiresIn?: number;
    readonly redirectUri?: string | null;
  } = {},
) {
  const name = options.name ?? "Ada Lovelace";
  let device: DeviceDecision = "pending";
  let pendingBeforeApproval = 0;
  let serial = 0;
  let unreachable = false;
  const liveRefreshTokens = new Set<string>();
  const codes = new Map<string, { challenge: string; redirectUri: string; scope: string }>();
  const requests: Array<{ readonly path: string; readonly params: URLSearchParams }> = [];

  const grant = (scope: string) => {
    serial += 1;
    const refreshToken = `refresh-${serial}`;
    liveRefreshTokens.add(refreshToken);
    return json(200, {
      access_token: accessTokenFor(scope, name, serial),
      refresh_token: refreshToken,
      expires_in: options.expiresIn ?? 3600,
      token_type: "Bearer",
      scope,
    });
  };

  const token = async (params: URLSearchParams) => {
    const grantType = params.get("grant_type");
    if (grantType === "urn:ietf:params:oauth:grant-type:device_code") {
      if (device === "approved" && pendingBeforeApproval-- <= 0) return grant("device");
      return json(400, { error: DEVICE_ERRORS[device === "approved" ? "pending" : device] });
    }
    if (grantType === "authorization_code") {
      const issued = codes.get(params.get("code") ?? "");
      codes.delete(params.get("code") ?? "");
      const verified =
        issued !== undefined &&
        issued.redirectUri === params.get("redirect_uri") &&
        issued.challenge === (await s256(params.get("code_verifier") ?? ""));
      return verified ? grant(issued.scope) : json(400, { error: "invalid_grant" });
    }
    if (grantType === "refresh_token") {
      const presented = params.get("refresh_token") ?? "";
      if (!liveRefreshTokens.delete(presented)) return json(400, { error: "invalid_grant" });
      return grant(params.get("scope") ?? "");
    }
    return json(400, { error: "unsupported_grant_type" });
  };

  const handle = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const params = new URLSearchParams(await request.text());
    requests.push({ path, params });
    if (unreachable) return json(503, { error: "temporarily_unavailable" });
    if (params.get("client_id") !== MOCK_CLIENT_ID) return json(400, { error: "invalid_client" });
    if (path === "/devicecode") {
      return json(200, {
        device_code: "device-code",
        user_code: MOCK_USER_CODE,
        verification_uri: MOCK_VERIFICATION_URI,
        expires_in: 900,
        interval: options.interval ?? 0,
      });
    }
    if (path === "/token") return token(params);
    return json(404, { error: "not_found" });
  };

  const account: MobileAccountDefinition = nexploreAccount({
    tenant: "mock",
    clientId: MOCK_CLIENT_ID,
    redirectUri: options.redirectUri ?? null,
    endpoints: {
      authorizationEndpoint: `${ORIGIN}/authorize`,
      tokenEndpoint: `${ORIGIN}/token`,
      deviceAuthorizationEndpoint: `${ORIGIN}/devicecode`,
    },
  });

  const httpClient = HttpClient.make((request) =>
    HttpClientRequest.toWeb(request).pipe(
      Effect.flatMap((web) => Effect.promise(() => handle(web))),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      Effect.orDie,
    ),
  );

  return {
    account,
    httpClient,
    requests,
    /** The user entering the code; the issuer still answers "pending" to the next `afterPolls`. */
    approveDevice: (afterPolls = 0) => {
      device = "approved";
      pendingBeforeApproval = afterPolls;
    },
    declineDevice: () => void (device = "declined"),
    expireDevice: () => void (device = "expired"),
    revokeAll: () => liveRefreshTokens.clear(),
    setUnreachable: (value: boolean) => void (unreachable = value),
    /** The user signing in on the issuer's page: the redirect the app's browser session returns. */
    authorize: (authorizeUrl: string) => {
      const url = new URL(authorizeUrl);
      const code = `code-${codes.size + 1}`;
      codes.set(code, {
        challenge: url.searchParams.get("code_challenge") ?? "",
        redirectUri: url.searchParams.get("redirect_uri") ?? "",
        scope: url.searchParams.get("scope") ?? "",
      });
      return `${url.searchParams.get("redirect_uri")}?code=${code}&state=${url.searchParams.get("state")}`;
    },
  };
}

export type MockAccountIssuer = ReturnType<typeof makeMockAccountIssuer>;

/** The platform's Web Crypto as the Effect `Crypto` service (expo-crypto in the app). */
export const webCrypto = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.promise(async () => {
      const input = new Uint8Array(data.length);
      input.set(data);
      return new Uint8Array(await globalThis.crypto.subtle.digest(algorithm, input));
    }),
});

/** The keychain as a Map, inspectable by the test. */
export const memorySecretStorage = (entries = new Map<string, string>()) =>
  ({
    entries,
    get: (key) => Effect.sync(() => entries.get(key) ?? null),
    set: (key, value) => Effect.sync(() => void entries.set(key, value)),
    remove: (key) => Effect.sync(() => void entries.delete(key)),
  }) satisfies AccountSecretStorage & { readonly entries: Map<string, string> };
