import { describe, expect, it, vi } from "vite-plus/test";

import {
  installMainSessionPermissions,
  isMainSessionPermissionAllowed,
} from "./t3team-MainSessionPermissions.ts";

const APP_URL = "t3code-dev://app/";

describe("isMainSessionPermissionAllowed", () => {
  it("allows audio capture for the app origin", () => {
    expect(
      isMainSessionPermissionAllowed(
        { permission: "media", requestingUrl: "t3code-dev://app/settings", mediaTypes: ["audio"] },
        APP_URL,
      ),
    ).toBe(true);
  });

  it("allows a media request that names no types", () => {
    expect(
      isMainSessionPermissionAllowed({ permission: "media", requestingUrl: APP_URL }, APP_URL),
    ).toBe(true);
  });

  it.each([
    ["video capture", { permission: "media", requestingUrl: APP_URL, mediaTypes: ["video"] }],
    [
      "audio plus video",
      { permission: "media", requestingUrl: APP_URL, mediaTypes: ["audio", "video"] },
    ],
    ["another origin", { permission: "media", requestingUrl: "https://evil.example/" }],
    ["an unparseable origin", { permission: "media", requestingUrl: "not a url" }],
  ])("denies %s", (_label, request) => {
    expect(isMainSessionPermissionAllowed(request, APP_URL)).toBe(false);
  });

  it.each(["notifications", "clipboard-read", "display-capture", "fullscreen"])(
    "leaves %s as Electron decides it by default, which is granted",
    (permission) => {
      expect(isMainSessionPermissionAllowed({ permission, requestingUrl: APP_URL }, APP_URL)).toBe(
        true,
      );
    },
  );
});

describe("installMainSessionPermissions", () => {
  function install() {
    const session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    };
    installMainSessionPermissions(session, APP_URL);
    return {
      request: session.setPermissionRequestHandler.mock.calls[0]?.[0],
      check: session.setPermissionCheckHandler.mock.calls[0]?.[0],
    };
  }

  it("grants microphone requests from the app through the request handler", () => {
    const { request } = install();
    const callback = vi.fn();
    request({}, "media", callback, { requestingUrl: APP_URL, mediaTypes: ["audio"] });
    expect(callback).toHaveBeenCalledWith(true);
  });

  it("denies video capture and foreign origins, and keeps other permissions granted", () => {
    const { request } = install();
    const callback = vi.fn();
    request({}, "media", callback, { requestingUrl: APP_URL, mediaTypes: ["video"] });
    request({}, "media", callback, { requestingUrl: "https://evil.example/" });
    request({}, "notifications", callback, { requestingUrl: APP_URL });
    expect(callback.mock.calls).toEqual([[false], [false], [true]]);
  });

  it("answers permission checks with the same policy", () => {
    const { check } = install();
    expect(
      check({}, "media", "t3code-dev://app", { requestingUrl: APP_URL, mediaType: "audio" }),
    ).toBe(true);
    expect(
      check({}, "media", "t3code-dev://app", { requestingUrl: APP_URL, mediaType: "video" }),
    ).toBe(false);
    expect(
      check({}, "media", "https://evil.example", { requestingUrl: "https://evil.example/" }),
    ).toBe(false);
  });
});
