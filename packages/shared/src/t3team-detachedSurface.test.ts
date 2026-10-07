import { describe, expect, it } from "vitest";

import {
  detachedSurfaceKindFromPath,
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
    expect(url.pathname).toBe("/t3team/detached/pull-request");
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
    expect(detachedSurfaceKindFromPath("/t3team/detached/pull-request")).toBe("pull-request");
    expect(detachedSurfaceKindFromPath("/t3team/detached/pull-request/")).toBe("pull-request");
  });

  it("rejects anything else", () => {
    expect(isDetachedSurfacePath("/t3team/detached/")).toBe(false);
    expect(isDetachedSurfacePath("/t3team/detached/a/b")).toBe(false);
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
});
