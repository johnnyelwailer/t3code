// @vitest-environment jsdom
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
  isAtlassianOAuthCallbackMessage,
  postAtlassianOAuthCallbackToOpener,
} from "./t3team-atlassianOAuthCallbackMessage";

describe("postAtlassianOAuthCallbackToOpener", () => {
  it("posts callback href to opener with wildcard target for cross-origin shells", () => {
    const postMessage = vi.fn();
    const opener = { closed: false, postMessage } as unknown as Window;
    const originalOpener = window.opener;

    Object.defineProperty(window, "opener", { value: opener, configurable: true });

    const href = "http://127.0.0.1:5733/oauth/callback?code=abc&state=xyz";
    expect(postAtlassianOAuthCallbackToOpener(href)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE, href },
      "*",
    );

    Object.defineProperty(window, "opener", { value: originalOpener, configurable: true });
  });

  it("returns false when opener is missing or closed", () => {
    const originalOpener = window.opener;

    Object.defineProperty(window, "opener", { value: null, configurable: true });
    expect(postAtlassianOAuthCallbackToOpener("http://127.0.0.1:5733/oauth/callback")).toBe(false);

    const closedOpener = { closed: true, postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(window, "opener", { value: closedOpener, configurable: true });
    expect(postAtlassianOAuthCallbackToOpener("http://127.0.0.1:5733/oauth/callback")).toBe(false);

    Object.defineProperty(window, "opener", { value: originalOpener, configurable: true });
  });
});

describe("isAtlassianOAuthCallbackMessage", () => {
  const redirectUri = "http://127.0.0.1:5733/oauth/callback";

  it("accepts callback messages with matching redirect prefix", () => {
    const message = {
      type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
      href: `${redirectUri}?code=abc&state=xyz`,
    };
    expect(isAtlassianOAuthCallbackMessage(message, redirectUri)).toBe(true);
  });

  it("rejects messages with mismatched redirect prefix", () => {
    const message = {
      type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
      href: "https://evil.example/oauth/callback?code=abc",
    };
    expect(isAtlassianOAuthCallbackMessage(message, redirectUri)).toBe(false);
  });
});
