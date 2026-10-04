import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TEAM_BETA_FLAGS_STORAGE_KEY } from "~/t3team/t3team-betaFlags";

import { T3TeamBetaSettings } from "./t3team-BetaSettings";

describe("T3TeamBetaSettings", () => {
  it("renders the Beta section with one control per flag and a reset action", () => {
    const storage = new Map<string, string>();
    const windowStub = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Window & typeof globalThis;
    Object.defineProperty(globalThis, "window", {
      value: windowStub,
      configurable: true,
      writable: true,
    });

    const markup = renderToStaticMarkup(<T3TeamBetaSettings />);

    expect(markup).toContain("Beta");
    expect(markup).toContain("Burndown in digest header");
    expect(markup).toContain("Default My Work lens");
    expect(markup).toContain("Digest row navigation");
    expect(markup).toContain("Agent dots on digest rows");
    expect(markup).toContain("Reset to defaults");

    // No flag stored: the default selections are shown.
    expect(markup).toContain("Off");
    expect(markup).toContain("In-app");
    expect(markup).toContain("Stacked");
    expect(storage.get(T3TEAM_BETA_FLAGS_STORAGE_KEY)).toBeUndefined();
  });
});
