import { describe, expect, it } from "vite-plus/test";

import {
  detachedSurfaceUrl,
  detachedSurfaceWindowName,
  isDetachedSurfaceWindowRequest,
} from "./t3team-detachedSurface.ts";
import {
  detachedSurfaceLandingUrl,
  detachedViewRequest,
  detachedViewRoute,
} from "./t3team-detachedView.ts";

describe("detachedViewRoute", () => {
  it("accepts app-relative routes with their search", () => {
    expect(detachedViewRoute("/t3team/my-work")).toBe("/t3team/my-work");
    expect(detachedViewRoute("/t3team/projects/p1?projectView=backlog&view=board")).toBe(
      "/t3team/projects/p1?projectView=backlog&view=board",
    );
  });

  it("refuses anything that would leave the app or loop back into a detached page", () => {
    for (const value of [
      undefined,
      "",
      "t3team/my-work",
      "//evil.example/x",
      "/\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "/t3team-detached/view?path=/t3team/my-work",
      `/${"a".repeat(2100)}`,
    ]) {
      expect(detachedViewRoute(value)).toBe(null);
    }
  });
});

describe("detachedViewRequest", () => {
  it("keys the window by route, so the same view is one window", () => {
    const first = detachedViewRequest({ route: "/usage", title: "Usage" });
    const again = detachedViewRequest({ route: "/usage", title: "Usage (renamed)" });
    const other = detachedViewRequest({ route: "/pull-requests", title: "Pull requests" });
    expect(detachedSurfaceWindowName(first)).toBe(detachedSurfaceWindowName(again));
    expect(detachedSurfaceWindowName(first)).not.toBe(detachedSurfaceWindowName(other));
  });

  it("is a detached-surface request the desktop accepts, in both routing forms", () => {
    const request = detachedViewRequest({ route: "/t3team/my-work", title: "My Work" });
    for (const [appUrl, routing] of [
      ["t3code://app/", "hash"],
      ["http://localhost:5733/", "path"],
    ] as const) {
      const url = detachedSurfaceUrl(appUrl, request, routing);
      expect(
        isDetachedSurfaceWindowRequest({
          applicationUrl: appUrl,
          url,
          frameName: detachedSurfaceWindowName(request),
        }),
      ).toBe(true);
    }
  });

  it("throws for a route it cannot undock", () => {
    expect(() => detachedViewRequest({ route: "//evil", title: "x" })).toThrow();
  });
});

describe("detachedSurfaceLandingUrl", () => {
  const request = detachedViewRequest({
    route: "/t3team/projects/p1/tickets/NEX-1?chatThreadId=t1",
    title: "NEX-1",
  });

  it("is the view's own route, in the routing form of the request", () => {
    expect(detachedSurfaceLandingUrl(detachedSurfaceUrl("t3code://app/", request, "hash"))).toBe(
      "t3code://app/#/t3team/projects/p1/tickets/NEX-1?chatThreadId=t1",
    );
    expect(
      detachedSurfaceLandingUrl(detachedSurfaceUrl("http://localhost:5733/", request, "path")),
    ).toBe("http://localhost:5733/t3team/projects/p1/tickets/NEX-1?chatThreadId=t1");
  });

  it("leaves every other URL as it is", () => {
    const pullRequest = "t3code://app/#/t3team-detached/pull-request?number=12";
    expect(detachedSurfaceLandingUrl(pullRequest)).toBe(pullRequest);
    expect(detachedSurfaceLandingUrl("t3code://app/#/t3team-detached/view")).toBe(
      "t3code://app/#/t3team-detached/view",
    );
    expect(detachedSurfaceLandingUrl("not a url")).toBe("not a url");
  });
});
