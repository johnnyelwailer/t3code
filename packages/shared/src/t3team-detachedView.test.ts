import { describe, expect, it } from "vite-plus/test";

import {
  detachedSurfaceUrl,
  detachedSurfaceWindowName,
  isDetachedSurfaceWindowRequest,
} from "./t3team-detachedSurface.ts";
import {
  detachedViewRequest,
  isDetachedSurfaceShowing,
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
  it("keys the window by the route's path, so the same view is one window", () => {
    const first = detachedViewRequest({ route: "/usage", title: "Usage" });
    const again = detachedViewRequest({ route: "/usage?metric=cost", title: "Usage (renamed)" });
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

describe("isDetachedSurfaceShowing", () => {
  const request = detachedViewRequest({
    route: "/t3team/projects/p1/tickets/NEX-1?chatThreadId=t1",
    title: "NEX-1",
  });
  const hashUrl = detachedSurfaceUrl("t3code://app/", request, "hash");
  const pathUrl = detachedSurfaceUrl("http://localhost:5733/", request, "path");
  const showing = (current: string, url = hashUrl) => isDetachedSurfaceShowing(current, url);

  it("counts an undocked view as shown while its window is on the view's route path", () => {
    expect(showing("t3code://app/#/t3team/projects/p1/tickets/NEX-1")).toBe(true);
    expect(
      showing("http://localhost:5733/t3team/projects/p1/tickets/NEX-1?tab=details", pathUrl),
    ).toBe(true);
  });

  it("does not count it once the window has navigated to another view", () => {
    expect(showing("t3code://app/#/t3team/projects/p1/tickets/NEX-2")).toBe(false);
    expect(showing("t3code://app/#/t3team/my-work")).toBe(false);
  });

  it("compares every other surface by its whole URL", () => {
    const pullRequest = "t3code://app/#/t3team-detached/pull-request?number=12";
    expect(showing(pullRequest, pullRequest)).toBe(true);
    expect(showing(`${pullRequest}&tab=code`, pullRequest)).toBe(false);
    expect(showing("not a url")).toBe(false);
  });
});
