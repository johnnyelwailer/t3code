// @vitest-environment jsdom
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ATLASSIAN_OAUTH_CALLBACK_CHANNEL,
  ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
  broadcastAtlassianOAuthCallback,
  isAtlassianOAuthCallbackMessage,
  postAtlassianOAuthCallbackToOpener,
} from "./t3team-atlassianOAuthCallbackMessage";

describe("postAtlassianOAuthCallbackToOpener", () => {
  /*
    The wildcard is load-bearing, not an oversight: the desktop shell's opener is on a custom scheme
    while this page is on http://localhost, so naming an origin here would address the message to the
    wrong window. Forgery is rejected on the receiving side instead — see the origin check in
    `t3team-atlassianOAuthPopup.ts`, which compares against the flow's own redirect URI.
  */
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

describe("broadcastAtlassianOAuthCallback", () => {
  /**
   * The broadcast is what carries the result home when the popup was blocked and the user opened the
   * authorize URL in an ordinary tab — there is no opener to post to in that case.
   */
  it("broadcasts the callback href on the shared channel", async () => {
    const href = "http://127.0.0.1:5733/oauth/callback?code=abc&state=xyz";
    const listener = new BroadcastChannel(ATLASSIAN_OAUTH_CALLBACK_CHANNEL);
    const received = new Promise<unknown>((resolve) => {
      listener.addEventListener("message", (event) => resolve(event.data));
    });

    expect(broadcastAtlassianOAuthCallback(href)).toBe(true);

    expect(await received).toEqual({
      type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
      href,
    });
    listener.close();
  });

  it("broadcasts even with no opener, which is the whole point of the channel", () => {
    const originalOpener = window.opener;
    Object.defineProperty(window, "opener", { value: null, configurable: true });

    const href = "http://127.0.0.1:5733/oauth/callback?code=abc&state=xyz";
    expect(postAtlassianOAuthCallbackToOpener(href)).toBe(false);
    expect(broadcastAtlassianOAuthCallback(href)).toBe(true);

    Object.defineProperty(window, "opener", { value: originalOpener, configurable: true });
  });
});
