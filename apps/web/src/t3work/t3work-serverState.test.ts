import { describe, expect, it } from "vite-plus/test";

import { shouldRefreshPrimaryProviders } from "./t3work-serverState";

describe("t3work server state", () => {
  it("refreshes providers when connected config has no provider snapshots", () => {
    expect(
      shouldRefreshPrimaryProviders({
        enabled: true,
        isConnected: true,
        environmentId: "local",
        serverConfig: { providers: [] },
      }),
    ).toBe(true);
  });

  it("does not refresh before connection and config are ready", () => {
    expect(
      shouldRefreshPrimaryProviders({
        enabled: true,
        isConnected: false,
        environmentId: "local",
        serverConfig: { providers: [] },
      }),
    ).toBe(false);
    expect(
      shouldRefreshPrimaryProviders({
        enabled: true,
        isConnected: true,
        environmentId: null,
        serverConfig: { providers: [] },
      }),
    ).toBe(false);
    expect(
      shouldRefreshPrimaryProviders({
        enabled: true,
        isConnected: true,
        environmentId: "local",
        serverConfig: null,
      }),
    ).toBe(false);
  });

  it("does not refresh once provider snapshots are present", () => {
    expect(
      shouldRefreshPrimaryProviders({
        enabled: true,
        isConnected: true,
        environmentId: "local",
        serverConfig: { providers: [{} as never] },
      }),
    ).toBe(false);
  });
});
