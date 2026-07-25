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
      }),
    ).toBe("http://127.0.0.1:5733/oauth/callback");
  });

  it("throws when a custom-protocol shell has no redirect configuration", () => {
    expect(() =>
      resolveAtlassianOAuthRedirectUri({
        locationOrigin: "t3code-dev://app",
        configuredRedirectUri: "",
        devServerUrl: "",
      }),
    ).toThrow(/VITE_ATLASSIAN_OAUTH_REDIRECT_URI/);
  });
});
