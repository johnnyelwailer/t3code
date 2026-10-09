import { describe, expect, it } from "vite-plus/test";

import {
  appRoutePathname,
  detachedSurfaceKindFromPath,
  detachedSurfaceUrl,
  detachedSurfacePath,
  detachedSurfaceWindowName,
  isDetachedSurfacePath,
  isDetachedSurfaceWindowRequest,
} from "./t3team-detachedSurface.ts";

const request = {
  kind: "pull-request",
  key: "github.com/acme/app#12",
  params: { repository: "acme/app", number: "12", tab: "code" },
  title: "  Fix the thing  ",
};

describe("detachedSurfacePath", () => {
  it("carries the kind in the path and the params and trimmed title in the search", () => {
    const url = new URL(detachedSurfacePath(request), "t3code://app");
    expect(url.pathname).toBe("/t3team-detached/pull-request");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      repository: "acme/app",
      number: "12",
      tab: "code",
      title: "Fix the thing",
    });
  });

  it("does not let a param overwrite the title", () => {
    const path = detachedSurfacePath({ ...request, params: { title: "spoofed" }, title: "Real" });
    expect(new URL(path, "https://x").searchParams.getAll("title")).toEqual(["Real"]);
  });

  it("refuses a kind that could escape the path segment", () => {
    expect(() => detachedSurfacePath({ ...request, kind: "../settings" })).toThrow();
  });
});

describe("detachedSurfaceKindFromPath", () => {
  it("reads the kind, tolerating a trailing slash", () => {
    expect(detachedSurfaceKindFromPath("/t3team-detached/pull-request")).toBe("pull-request");
    expect(detachedSurfaceKindFromPath("/t3team-detached/pull-request/")).toBe("pull-request");
  });

  it("rejects anything else", () => {
    expect(isDetachedSurfacePath("/t3team-detached/")).toBe(false);
    expect(isDetachedSurfacePath("/t3team-detached/a/b")).toBe(false);
    expect(isDetachedSurfacePath("/pull-requests")).toBe(false);
  });
});

describe("isDetachedSurfaceWindowRequest", () => {
  const applicationUrl = "t3code://app/";
  const frameName = detachedSurfaceWindowName(request);
  const url = `t3code://app${detachedSurfacePath(request)}`;

  it("accepts the app's own detached-surface URL under the detached window name", () => {
    expect(isDetachedSurfaceWindowRequest({ applicationUrl, url, frameName })).toBe(true);
  });

  it("rejects another origin, another path, or another window name", () => {
    expect(
      isDetachedSurfaceWindowRequest({
        applicationUrl,
        url: `https://evil.example${detachedSurfacePath(request)}`,
        frameName,
      }),
    ).toBe(false);
    expect(
      isDetachedSurfaceWindowRequest({ applicationUrl, url: "t3code://app/settings", frameName }),
    ).toBe(false);
    expect(isDetachedSurfaceWindowRequest({ applicationUrl, url, frameName: "_blank" })).toBe(
      false,
    );
    expect(isDetachedSurfaceWindowRequest({ applicationUrl, url: "not a url", frameName })).toBe(
      false,
    );
  });

  // `new URL("t3code://app").origin` is the opaque "null", shared by every non-special scheme.
  it("does not treat another custom scheme or a data URL as the app's origin", () => {
    const path = detachedSurfacePath(request);
    for (const url of [`evil://app${path}`, `t3code://other${path}`, `data:text/html,${path}`]) {
      expect(isDetachedSurfaceWindowRequest({ applicationUrl, url, frameName })).toBe(false);
    }
  });
});

describe("hash routing (the desktop renderer)", () => {
  const frameName = detachedSurfaceWindowName(request);

  it("puts the route in the hash, and reads it back", () => {
    const url = detachedSurfaceUrl("t3code://app/#/pull-requests?x=1", request, "hash");
    expect(url.startsWith("t3code://app/#/t3team-detached/pull-request?")).toBe(true);
    expect(appRoutePathname(new URL(url))).toBe("/t3team-detached/pull-request");
    expect(
      isDetachedSurfaceWindowRequest({ applicationUrl: "t3code://app/", url, frameName }),
    ).toBe(true);
  });

  it("puts the route in the path for path routing", () => {
    const url = detachedSurfaceUrl("http://localhost:3773/pull-requests", request, "path");
    expect(new URL(url).pathname).toBe("/t3team-detached/pull-request");
    expect(appRoutePathname(new URL(url))).toBe("/t3team-detached/pull-request");
  });

  it("does not read a non-route fragment as a route", () => {
    expect(appRoutePathname(new URL("https://x/t3team-detached/pull-request#section"))).toBe(
      "/t3team-detached/pull-request",
    );
    expect(appRoutePathname(new URL("t3code://app/#/pull-requests"))).toBe("/pull-requests");
  });
});
