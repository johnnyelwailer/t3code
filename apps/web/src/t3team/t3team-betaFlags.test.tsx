import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_T3TEAM_BETA_FLAGS,
  readT3TeamBetaFlags,
  resetT3TeamBetaFlags,
  T3TEAM_BETA_FLAGS_STORAGE_KEY,
  useT3TeamBetaFlags,
  writeT3TeamBetaFlag,
} from "./t3team-betaFlags";

function stubWindowWithStorage(initial?: Record<string, string>): void {
  const storage = new Map<string, string>(Object.entries(initial ?? {}));
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
}

describe("t3team beta flags", () => {
  it("reads the defaults when nothing is stored", () => {
    stubWindowWithStorage();
    expect(readT3TeamBetaFlags()).toEqual(DEFAULT_T3TEAM_BETA_FLAGS);
  });

  it("persists a flag set and reads it back", () => {
    stubWindowWithStorage();
    writeT3TeamBetaFlag("digestBurndownVariant", "sparkline");
    writeT3TeamBetaFlag("digestDefaultLens", "board");

    expect(readT3TeamBetaFlags()).toMatchObject({
      digestBurndownVariant: "sparkline",
      digestDefaultLens: "board",
      digestRowNavigation: "in-app",
      digestAgentDots: "stacked",
    });

    const raw = window.localStorage.getItem(T3TEAM_BETA_FLAGS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({
      digestBurndownVariant: "sparkline",
      digestDefaultLens: "board",
    });
  });

  it("round-trips through a fresh storage read of the raw record", () => {
    stubWindowWithStorage({
      [T3TEAM_BETA_FLAGS_STORAGE_KEY]: JSON.stringify({
        digestAgentDots: "badges",
      }),
    });
    // Only stored keys override; the rest stay at defaults.
    expect(readT3TeamBetaFlags()).toEqual({
      ...DEFAULT_T3TEAM_BETA_FLAGS,
      digestAgentDots: "badges",
    });
  });

  it("ignores corrupt and invalid stored values", () => {
    stubWindowWithStorage({ [T3TEAM_BETA_FLAGS_STORAGE_KEY]: "not json" });
    expect(readT3TeamBetaFlags()).toEqual(DEFAULT_T3TEAM_BETA_FLAGS);

    stubWindowWithStorage({
      [T3TEAM_BETA_FLAGS_STORAGE_KEY]: JSON.stringify({
        digestBurndownVariant: "galaxy-brain",
        digestDefaultLens: "board",
      }),
    });
    expect(readT3TeamBetaFlags()).toMatchObject({
      digestBurndownVariant: "off",
      digestDefaultLens: "board",
    });
  });

  it("rejects an unknown flag value from the write path", () => {
    stubWindowWithStorage();
    writeT3TeamBetaFlag("digestRowNavigation", "warp" as never);
    expect(readT3TeamBetaFlags().digestRowNavigation).toBe("in-app");
  });

  it("resets every flag back to the defaults", () => {
    stubWindowWithStorage();
    writeT3TeamBetaFlag("digestBurndownVariant", "chart");
    writeT3TeamBetaFlag("digestRowNavigation", "ticket-url");
    resetT3TeamBetaFlags();

    expect(readT3TeamBetaFlags()).toEqual(DEFAULT_T3TEAM_BETA_FLAGS);
    expect(JSON.parse(window.localStorage.getItem(T3TEAM_BETA_FLAGS_STORAGE_KEY) ?? "{}")).toEqual(
      DEFAULT_T3TEAM_BETA_FLAGS,
    );
  });

  it("exposes the current flags through the hook", () => {
    stubWindowWithStorage({
      [T3TEAM_BETA_FLAGS_STORAGE_KEY]: JSON.stringify({ digestBurndownVariant: "chart" }),
    });

    function Probe() {
      const { flags, setFlag } = useT3TeamBetaFlags();
      return (
        <span data-set-flag={typeof setFlag}>
          {flags.digestBurndownVariant}/{flags.digestAgentDots}
        </span>
      );
    }

    const markup = renderToStaticMarkup(<Probe />);
    expect(markup).toContain("chart/stacked");
    expect(markup).toContain('data-set-flag="function"');
  });
});
