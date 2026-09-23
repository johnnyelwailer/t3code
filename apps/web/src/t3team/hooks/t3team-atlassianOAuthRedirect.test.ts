import { describe, expect, it } from "vite-plus/test";
import { resolveAtlassianOAuthRedirectUri } from "./t3team-atlassianOAuthRedirect";

describe("resolveAtlassianOAuthRedirectUri", () => {
  it("uses the configured redirect URI when provided", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code-dev://app",
        configuredRedirectUri: "http://127.0.0.1:5733/oauth/callback",
        devServerUrl: "",
      }),
    ).toBe("http://127.0.0.1:5733/oauth/callback");
  });

  it("prefers the configured value over the page origin in non-desktop shells", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "http://localhost:5733",
        configuredRedirectUri: "http://127.0.0.1:5733/oauth/callback",
        devServerUrl: "",
      }),
    ).toBe("http://127.0.0.1:5733/oauth/callback");
  });

  it("uses the current HTTP origin for browser dev", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "http://localhost:5733",
        configuredRedirectUri: "",
        devServerUrl: "",
      }),
    ).toBe("http://localhost:5733/oauth/callback");
  });

  it("uses the dev server URL for custom-protocol desktop shells", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code-dev://app",
        configuredRedirectUri: "",
        devServerUrl: "http://127.0.0.1:5733",
        desktop: true,
      }),
    ).toBe("http://127.0.0.1:5733/oauth/callback");
  });

  it("uses the desktop local bootstrap base URL for packaged desktop shells", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code://app",
        configuredRedirectUri: "",
        devServerUrl: "",
        desktop: true,
        desktopHttpBaseUrl: "http://127.0.0.1:3773/",
      }),
    ).toBe("http://127.0.0.1:3773/oauth/callback");
  });

  it("prefers the live desktop base URL over a stale baked configured value", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code://app",
        configuredRedirectUri: "http://127.0.0.1:3774/oauth/callback",
        devServerUrl: "",
        desktop: true,
        desktopHttpBaseUrl: "http://127.0.0.1:3773",
      }),
    ).toBe("http://127.0.0.1:3773/oauth/callback");
  });

  it("falls back to the baked configured value when the desktop bridge has no live base URL", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code://app",
        configuredRedirectUri: "http://127.0.0.1:3774/oauth/callback",
        devServerUrl: "",
        desktop: true,
        desktopHttpBaseUrl: "",
      }),
    ).toBe("http://127.0.0.1:3774/oauth/callback");
  });

  it("falls back to the default pinned port when a desktop shell has no live URL and no configured value", () => {
    expect(
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code://app",
        configuredRedirectUri: "",
        devServerUrl: "",
        desktop: true,
        desktopHttpBaseUrl: "",
      }),
    ).toBe("http://127.0.0.1:3773/oauth/callback");
  });

  it("throws when a custom-protocol shell has no redirect configuration", () => {
    expect(() =>
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code-dev://app",
        configuredRedirectUri: "",
        devServerUrl: "",
        desktopHttpBaseUrl: "",
      }),
    ).toThrow(/VITE_ATLASSIAN_OAUTH_REDIRECT_URI/);
  });
});
