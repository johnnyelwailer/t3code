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
