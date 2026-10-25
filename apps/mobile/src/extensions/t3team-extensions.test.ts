import { describe, expect, it, vi } from "vite-plus/test";

import { homeEmptyStateFor, mobileExtensions, runExtensionInstall } from "./t3team-extensions";

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
  const Welcome = () => null;

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

describe("slot rules and the startup hook", () => {
  const Component = () => null;

  it("treats a throwing rule as no opinion, so the stock screen stays", () => {
    const extensions = {
      homeEmptyState: {
        shouldRender: () => {
          throw new Error("rule failed");
        },
        Component,
      },
    };
    expect(homeEmptyStateFor(extensions, catalog, "android")).toBeNull();
  });

  it("runs the startup hook once and survives a hook that throws", () => {
    let calls = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    runExtensionInstall({
      install: () => {
        calls += 1;
        throw new Error("install failed");
      },
    });
    runExtensionInstall({ install: () => (calls += 1) });
    expect(calls).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
