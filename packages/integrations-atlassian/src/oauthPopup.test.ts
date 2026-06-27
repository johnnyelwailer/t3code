import { describe, expect, it } from "@effect/vitest";
import {
  ATLASSIAN_OAUTH_POPUP_FRAME_NAME,
  isAtlassianOAuthAuthorizeUrl,
  isAtlassianOAuthPopupRequest,
} from "./oauthPopup.ts";

describe("oauthPopup", () => {
  it("recognizes Atlassian authorize URLs", () => {
    expect(
      isAtlassianOAuthAuthorizeUrl(
        "https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=abc",
      ),
    ).toBe(true);
    expect(isAtlassianOAuthAuthorizeUrl("https://example.com/authorize")).toBe(false);
    expect(isAtlassianOAuthAuthorizeUrl("not-a-url")).toBe(false);
  });

  it("recognizes OAuth popup requests by frame name or authorize URL", () => {
    expect(
      isAtlassianOAuthPopupRequest({
        url: "https://example.com/",
        frameName: ATLASSIAN_OAUTH_POPUP_FRAME_NAME,
      }),
    ).toBe(true);
    expect(
      isAtlassianOAuthPopupRequest({
        url: "https://auth.atlassian.com/authorize?client_id=abc",
      }),
    ).toBe(true);
    expect(
      isAtlassianOAuthPopupRequest({
        url: "https://accounts.microsoft.com/oauth",
      }),
    ).toBe(false);
  });
});
