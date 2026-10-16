import { describe, expect, it, vi } from "vite-plus/test";

import {
  DEV_NEXPLORE_CLIENT_ID,
  DEV_NEXPLORE_TENANT,
  defaultSignInMethod,
  normalizeAppRedirectUri,
  resolveMobileAccount,
  signInMethods,
} from "./t3team-accountIssuer";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

const TENANT = "11111111-2222-3333-4444-555555555555";
const CLIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("resolveMobileAccount", () => {
  it("falls back to the Nexplore pack's public ids for an unconfigured build", () => {
    const { account, issuerIsDevDefault } = resolveMobileAccount({});

    expect(issuerIsDevDefault).toBe(true);
    expect(account.issuer).toEqual({
      clientId: DEV_NEXPLORE_CLIENT_ID,
      authorizationEndpoint: `https://login.microsoftonline.com/${DEV_NEXPLORE_TENANT}/oauth2/v2.0/authorize`,
      tokenEndpoint: `https://login.microsoftonline.com/${DEV_NEXPLORE_TENANT}/oauth2/v2.0/token`,
      deviceAuthorizationEndpoint: `https://login.microsoftonline.com/${DEV_NEXPLORE_TENANT}/oauth2/v2.0/devicecode`,
    });
    expect(account.redirectUri).toBeNull();
  });

  it("derives the Entra endpoints and broker scope from the distribution's tenant and app", () => {
    const { account, issuerIsDevDefault } = resolveMobileAccount({
      account: { tenant: ` ${TENANT} `, clientId: CLIENT.toUpperCase() },
    });

    expect(issuerIsDevDefault).toBe(false);
    expect(account.issuer.clientId).toBe(CLIENT);
    expect(account.issuer.tokenEndpoint).toBe(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    );
    expect(account.resources).toEqual({ broker: `api://${CLIENT}/relay.access` });
    expect(account.signInResource).toBe("broker");
    expect(account.baseScopes).toBe("openid profile offline_access");
  });

  it("lets https endpoint overrides point at another issuer, ignoring insecure ones", () => {
    const { account } = resolveMobileAccount({
      account: {
        tenant: TENANT,
        clientId: CLIENT,
        endpoints: {
          authorization: "https://issuer.example.test/authorize",
          token: "http://issuer.example.test/token",
        },
      },
    });

    expect(account.issuer.authorizationEndpoint).toBe("https://issuer.example.test/authorize");
    expect(account.issuer.tokenEndpoint).toBe(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    );
  });

  it("treats a half-configured issuer as unconfigured instead of mixing tenants", () => {
    expect(resolveMobileAccount({ account: { tenant: TENANT } }).issuerIsDevDefault).toBe(true);
    expect(resolveMobileAccount({ account: { clientId: "not-a-guid" } }).issuerIsDevDefault).toBe(
      true,
    );
  });
});

describe("normalizeAppRedirectUri", () => {
  it("accepts only app-scheme redirects", () => {
    expect(normalizeAppRedirectUri("nexiwork://auth")).toBe("nexiwork://auth");
    expect(normalizeAppRedirectUri("msauth.ch.nexplore.nexiwork://auth")).toBe(
      "msauth.ch.nexplore.nexiwork://auth",
    );
    expect(normalizeAppRedirectUri("https://evil.example.test/callback")).toBeNull();
    expect(normalizeAppRedirectUri("")).toBeNull();
    expect(normalizeAppRedirectUri(42)).toBeNull();
  });
});

describe("signInMethods", () => {
  it("defaults to the browser when the app redirect is set, else to the code", () => {
    const withRedirect = resolveMobileAccount({ account: { redirectUri: "nexiwork-dev://auth" } });
    const without = resolveMobileAccount({});

    expect(signInMethods(withRedirect.account)).toEqual({ browser: true, code: true });
    expect(defaultSignInMethod(signInMethods(withRedirect.account))).toBe("browser");
    expect(signInMethods(without.account)).toEqual({ browser: false, code: true });
    expect(defaultSignInMethod(signInMethods(without.account))).toBe("code");
    expect(defaultSignInMethod({ browser: false, code: false })).toBeNull();
  });
});
