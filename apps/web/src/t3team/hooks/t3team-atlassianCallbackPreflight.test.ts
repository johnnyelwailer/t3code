import { describe, expect, it } from "vite-plus/test";

import {
  checkAtlassianCallbackRegistered,
  readRegisteredAtlassianCallbackPorts,
} from "./t3team-atlassianCallbackPreflight";

describe("checkAtlassianCallbackRegistered", () => {
  it("passes a registered loopback port", () => {
    expect(
      checkAtlassianCallbackRegistered("http://127.0.0.1:3773/oauth/callback", [3773, 3774]),
    ).toBeNull();
    expect(
      checkAtlassianCallbackRegistered("http://127.0.0.1:3774/oauth/callback", [3773, 3774]),
    ).toBeNull();
  });

  it("names the port and the exact URL to register when the port is not registered", () => {
    const message = checkAtlassianCallbackRegistered(
      "http://127.0.0.1:3775/oauth/callback",
      [3773],
    );
    expect(message).toContain("port 3775");
    expect(message).toContain("http://127.0.0.1:3775/oauth/callback is not registered");
    expect(message).toContain("registered: http://127.0.0.1:3773/oauth/callback");
  });

  it("does not check a build that carries no list", () => {
    expect(
      checkAtlassianCallbackRegistered("http://127.0.0.1:3775/oauth/callback", undefined),
    ).toBeNull();
  });

  it("only checks loopback http callbacks", () => {
    expect(
      checkAtlassianCallbackRegistered("https://app.example.com/oauth/callback", [3773]),
    ).toBeNull();
    expect(checkAtlassianCallbackRegistered("not a url", [3773])).toBeNull();
    expect(
      checkAtlassianCallbackRegistered("http://localhost:3999/oauth/callback", [3773]),
    ).toContain("port 3999");
  });
});

describe("readRegisteredAtlassianCallbackPorts", () => {
  it("is undefined when the build defines no list", () => {
    expect(readRegisteredAtlassianCallbackPorts()).toBeUndefined();
  });
});
