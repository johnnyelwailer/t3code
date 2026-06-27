import { describe, expect, it } from "vite-plus/test";
import type { ProviderInstanceEntry } from "~/providerInstances";
import { getT3workKickoffProviderBlocker } from "./t3work-kickoffLaunchConfig";

function providerEntry(overrides: Partial<ProviderInstanceEntry> = {}): ProviderInstanceEntry {
  return {
    enabled: true,
    installed: true,
    isAvailable: true,
    status: "ready",
    models: [],
    ...overrides,
  } as ProviderInstanceEntry;
}

describe("t3work kickoff launch config", () => {
  it("allows kickoff when the selected provider is ready", () => {
    const selectedProviderEntry = providerEntry();

    expect(
      getT3workKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [selectedProviderEntry],
        selectedProviderEntry,
      }),
    ).toBeNull();
  });

  it("explains why chat kickoff is blocked", () => {
    expect(
      getT3workKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [],
        selectedProviderEntry: undefined,
      }),
    ).toContain("No providers");

    const disabledProvider = providerEntry({ enabled: false });
    expect(
      getT3workKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [disabledProvider],
        selectedProviderEntry: disabledProvider,
      }),
    ).toContain("disabled");

    const unavailableProvider = providerEntry({ isAvailable: false });
    expect(
      getT3workKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [unavailableProvider],
        selectedProviderEntry: unavailableProvider,
      }),
    ).toContain("not ready");
  });
});
