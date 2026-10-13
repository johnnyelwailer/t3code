import { describe, expect, it } from "vite-plus/test";

import { isOwnOrigin } from "./t3team-credentialRoute.ts";

describe("isOwnOrigin", () => {
  it("accepts a page served by this server", () => {
    expect(
      isOwnOrigin({ origin: "http://localhost:3773", host: "localhost:3773", devUrl: undefined }),
    ).toBe(true);
  });

  it("accepts the dev web server, whose proxy rewrites Host to the backend's", () => {
    expect(
      isOwnOrigin({
        origin: "http://localhost:6275",
        host: "localhost:14315",
        devUrl: new URL("http://localhost:6275/"),
      }),
    ).toBe(true);
  });

  it("treats loopback aliases of the dev server as the same origin", () => {
    const devUrl = new URL("http://localhost:6275/");
    for (const origin of ["http://127.0.0.1:6275", "http://[::1]:6275"]) {
      expect(isOwnOrigin({ origin, host: "localhost:14315", devUrl })).toBe(true);
    }
    // Another port or scheme, a non-loopback host, or no devUrl is still refused.
    for (const origin of [
      "http://127.0.0.1:8080",
      "https://127.0.0.1:6275",
      "http://evil.test:6275",
    ]) {
      expect(isOwnOrigin({ origin, host: "localhost:14315", devUrl })).toBe(false);
    }
    expect(
      isOwnOrigin({ origin: "http://127.0.0.1:3773", host: "localhost:3773", devUrl: undefined }),
    ).toBe(false);
  });

  it("refuses another local page", () => {
    expect(
      isOwnOrigin({
        origin: "http://localhost:8080",
        host: "localhost:14315",
        devUrl: new URL("http://localhost:6275/"),
      }),
    ).toBe(false);
    expect(
      isOwnOrigin({ origin: "http://localhost:8080", host: "localhost:3773", devUrl: undefined }),
    ).toBe(false);
  });

  it("refuses an unreadable origin", () => {
    expect(isOwnOrigin({ origin: "null", host: "localhost:3773", devUrl: undefined })).toBe(false);
  });
});
