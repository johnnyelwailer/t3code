import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { homeEmptyStateFor, mobileExtensions } from "./t3team-extensions";

const catalog = { isLoadingConnections: false, hasConnections: false };

describe("mobileExtensions", () => {
  it("fills no slot in a build without an overlay, so every screen keeps its stock behavior", () => {
    expect(mobileExtensions).toEqual({});
    expect(mobileExtensions.homeEmptyState).toBeUndefined();
    expect(mobileExtensions.connectionsNewTop).toBeUndefined();
    expect(homeEmptyStateFor(mobileExtensions, catalog, "android")).toBeNull();
  });
});

describe("homeEmptyStateFor", () => {
  const Welcome = (props: { readonly onAddConnection: () => void }) =>
    createElement("p", null, typeof props.onAddConnection);

  it("returns the registered component when the slot says it applies", () => {
    const Component = homeEmptyStateFor(
      {
        homeEmptyState: {
          shouldRender: (_, platform) => platform === "android",
          Component: Welcome,
        },
      },
      catalog,
      "android",
    );
    expect(Component).toBe(Welcome);
    expect(renderToStaticMarkup(createElement(Component!, { onAddConnection: () => {} }))).toBe(
      "<p>function</p>",
    );
  });

  it("keeps the stock empty home when the slot declines", () => {
    const extensions = {
      homeEmptyState: {
        shouldRender: (_: unknown, platform: string) => platform === "android",
        Component: Welcome,
      },
    };
    expect(homeEmptyStateFor(extensions, catalog, "ios")).toBeNull();
  });
});
