// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE } from "~/t3team/components/t3team-atlassianOAuthCallbackMessage";
import {
  ATLASSIAN_OAUTH_POPUP_FRAME_NAME,
  buildOAuthPopupFeatures,
  waitForOAuthCallback,
} from "./t3team-atlassianOAuthPopup";

describe("t3team-atlassianOAuthPopup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds popup features without noopener so the callback can postMessage opener", () => {
    const features = buildOAuthPopupFeatures();
    expect(features).toContain("width=500");
    expect(features).toContain("height=600");
    expect(features).not.toContain("noopener");
    expect(features).not.toContain("noreferrer");
  });

  it("uses a stable popup frame name for desktop shell detection", () => {
    expect(ATLASSIAN_OAUTH_POPUP_FRAME_NAME).toBe("atlassian-oauth");
  });

  it("resolves from postMessage when popup source identity differs (desktop shell)", async () => {
    const redirectUri = "http://127.0.0.1:5733/oauth/callback";
    const href = `${redirectUri}?code=abc&state=xyz`;
    const popup = { closed: false, close: vi.fn() } as unknown as WindowProxy;

    const promise = waitForOAuthCallback(popup, redirectUri);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE, href },
        source: {} as Window,
      }),
    );

    await expect(promise).resolves.toBe(href);
  });

  it("waits for postMessage after popup closes before rejecting", async () => {
    const redirectUri = "http://127.0.0.1:5733/oauth/callback";
    const href = `${redirectUri}?code=abc&state=xyz`;
    const popup = { closed: false, close: vi.fn() } as unknown as WindowProxy;

    const promise = waitForOAuthCallback(popup, redirectUri);
    Object.defineProperty(popup, "closed", { value: true, configurable: true });

    vi.advanceTimersByTime(500);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE, href },
        source: {} as Window,
      }),
    );

    await expect(promise).resolves.toBe(href);
  });

  it("rejects when popup closes and no callback arrives within grace period", async () => {
    const redirectUri = "http://127.0.0.1:5733/oauth/callback";
    const popup = { closed: false, close: vi.fn() } as unknown as WindowProxy;

    const promise = waitForOAuthCallback(popup, redirectUri);
    Object.defineProperty(popup, "closed", { value: true, configurable: true });

    vi.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow("OAuth popup was closed before completing sign in.");
  });
});
