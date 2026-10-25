import { describe, expect, it, vi } from "vite-plus/test";

import { mobileExtensions, runExtensionInstall } from "./t3team-extensions";

describe("mobileExtensions", () => {
  it("fills no slot in a build without an overlay, so every screen keeps its stock behavior", () => {
    expect(mobileExtensions).toEqual({});
    expect(mobileExtensions.connectionsNewTop).toBeUndefined();
  });
});

describe("the startup hook", () => {
  it("runs once and survives a hook that throws or rejects", async () => {
    let calls = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    runExtensionInstall({
      install: () => {
        calls += 1;
        throw new Error("install failed");
      },
    });
    runExtensionInstall({ install: () => void (calls += 1) });
    expect(calls).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("logs a startup hook that returns a rejected promise", async () => {
    vi.resetModules();
    const { runExtensionInstall: runFresh } = await import("./t3team-extensions");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    runFresh({
      install: async () => {
        throw new Error("async install failed");
      },
    });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    warn.mockRestore();
  });
});
