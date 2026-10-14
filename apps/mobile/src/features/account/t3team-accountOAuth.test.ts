import { describe, expect, it } from "@effect/vitest";
import { makeAccountOAuthClient } from "@t3tools/shared/t3team-accountOAuth";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { vi } from "vite-plus/test";

import { runAccountBrowserSignIn } from "./t3team-accountBrowserSignIn";
import {
  MOCK_USER_CODE,
  MOCK_VERIFICATION_URI,
  makeMockAccountIssuer,
  memorySecretStorage,
  webCrypto,
} from "./t3team-mockAccountIssuer.fixtures";
import { makeAccountTokenStore, nameOf } from "./t3team-accountTokenStore";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const REDIRECT = "nexiwork://auth";

const setup = (options?: Parameters<typeof makeMockAccountIssuer>[0]) => {
  const issuer = makeMockAccountIssuer({ redirectUri: REDIRECT, ...options });
  return { issuer, oauth: makeAccountOAuthClient(issuer.account, issuer.httpClient) };
};

describe("device code", () => {
  it.live("polls past authorization_pending until the user approves", () =>
    Effect.gen(function* () {
      const { issuer, oauth } = setup();
      const code = yield* Option.getOrThrow(oauth.requestDeviceCode);
      expect(code.user_code).toBe(MOCK_USER_CODE);
      expect(code.verification_uri).toBe(MOCK_VERIFICATION_URI);

      issuer.approveDevice(2);
      const tokens = yield* oauth.pollDeviceToken(code);

      expect(nameOf(tokens.access_token)).toBe("Ada Lovelace");
      expect(tokens.refresh_token).toMatch(/^refresh-/);
      expect(issuer.requests.filter((request) => request.path === "/token")).toHaveLength(3);
      const deviceRequest = issuer.requests.find((request) => request.path === "/devicecode");
      expect(deviceRequest?.params.get("scope")).toBe(
        `api://${issuer.account.issuer.clientId}/relay.access openid profile offline_access`,
      );
    }),
  );

  it.live("reports a declined and an expired code in words the user can act on", () =>
    Effect.gen(function* () {
      const { issuer, oauth } = setup();
      const code = yield* Option.getOrThrow(oauth.requestDeviceCode);

      issuer.declineDevice();
      expect(yield* Effect.flip(oauth.pollDeviceToken(code))).toBe("The sign-in was declined.");
      issuer.expireDevice();
      expect(yield* Effect.flip(oauth.pollDeviceToken(code))).toBe(
        "The sign-in code expired. Start again.",
      );
    }),
  );
});

describe("authorization code + PKCE", () => {
  it.effect("exchanges the redirected code with the verifier the issuer checks", () =>
    Effect.gen(function* () {
      const { issuer, oauth } = setup();
      let opened = "";
      const tokens = yield* runAccountBrowserSignIn({
        oauth,
        redirectUri: REDIRECT,
        openAuthSession: (url) =>
          Effect.sync(() => {
            opened = url;
            return { type: "success" as const, url: issuer.authorize(url) };
          }),
      }).pipe(Effect.provideService(Crypto.Crypto, webCrypto));

      expect(nameOf(tokens.access_token)).toBe("Ada Lovelace");
      const authorize = new URL(opened);
      expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authorize.searchParams.get("redirect_uri")).toBe(REDIRECT);
      expect(authorize.searchParams.get("client_id")).toBe(issuer.account.issuer.clientId);
    }),
  );

  it.effect("rejects a redirect for another request and a dismissed browser", () =>
    Effect.gen(function* () {
      const { issuer, oauth } = setup();
      const forged = yield* runAccountBrowserSignIn({
        oauth,
        redirectUri: REDIRECT,
        openAuthSession: (url) =>
          Effect.succeed({
            type: "success",
            url: issuer.authorize(url).replace(/state=[^&]+/, "state=forged"),
          }),
      }).pipe(Effect.flip, Effect.provideService(Crypto.Crypto, webCrypto));
      expect(forged).toBe("The browser sign-in answered a different request. Try again.");

      const dismissed = yield* runAccountBrowserSignIn({
        oauth,
        redirectUri: REDIRECT,
        openAuthSession: () => Effect.succeed({ type: "dismiss" }),
      }).pipe(Effect.flip, Effect.provideService(Crypto.Crypto, webCrypto));
      expect(dismissed).toBe("The browser sign-in was cancelled.");
    }),
  );
});

describe("refresh and the stored grant", () => {
  it.live("keeps the grant in the keychain, rotates it, and tells a dead grant apart", () =>
    Effect.gen(function* () {
      const { issuer, oauth } = setup();
      const storage = memorySecretStorage();
      const store = yield* makeAccountTokenStore("nexplore", storage);
      issuer.approveDevice();
      const code = yield* Option.getOrThrow(oauth.requestDeviceCode);
      yield* store.store("broker", yield* oauth.pollDeviceToken(code));

      expect(storage.entries.get("t3team.account.nexplore.refresh-token")).toBe("refresh-1");
      expect(storage.entries.get("t3team.account.nexplore.name")).toBe("Ada Lovelace");
      const reopened = yield* makeAccountTokenStore("nexplore", storage);
      expect(yield* reopened.signedIn).toBe(true);
      expect(yield* reopened.name).toBe("Ada Lovelace");

      const rotated = yield* oauth.refresh("refresh-1", "broker");
      expect(rotated.refresh_token).toBe("refresh-2");
      expect(yield* Effect.flip(oauth.refresh("refresh-1", "broker"))).toBe("rejected");
      issuer.setUnreachable(true);
      expect(yield* Effect.flip(oauth.refresh("refresh-2", "broker"))).toBe("unreachable");

      yield* reopened.clear;
      expect(storage.entries.size).toBe(0);
      expect(yield* reopened.signedIn).toBe(false);
    }),
  );
});
