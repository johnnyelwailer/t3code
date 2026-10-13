import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import type { ProviderInstanceEntry } from "~/providerInstances";
import {
  getT3TeamKickoffProviderBlocker,
  hasConfiguredProviderSettings,
} from "./t3team-kickoffLaunchConfig";

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

describe("t3team kickoff launch config", () => {
  it("allows kickoff when the selected provider is ready", () => {
    const selectedProviderEntry = providerEntry();

    expect(
      getT3TeamKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [selectedProviderEntry],
        selectedProviderEntry,
      }),
    ).toBeNull();
  });

  it("does not call a connecting session disconnected", () => {
    expect(
      getT3TeamKickoffProviderBlocker({
        isConnected: false,
        connectionStatus: "connecting",
        providerInstanceEntries: [],
        selectedProviderEntry: undefined,
      }),
    ).toContain("Connecting");
    expect(
      getT3TeamKickoffProviderBlocker({
        isConnected: false,
        connectionStatus: "error",
        providerInstanceEntries: [],
        selectedProviderEntry: undefined,
      }),
    ).toContain("disconnected");
  });

  it("explains why chat kickoff is blocked", () => {
    expect(
      getT3TeamKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [],
        selectedProviderEntry: undefined,
      }),
    ).toContain("No providers");

    const disabledProvider = providerEntry({ enabled: false });
    expect(
      getT3TeamKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [disabledProvider],
        selectedProviderEntry: disabledProvider,
      }),
    ).toContain("disabled");

    const unavailableProvider = providerEntry({ isAvailable: false });
    expect(
      getT3TeamKickoffProviderBlocker({
        isConnected: true,
        providerInstanceEntries: [unavailableProvider],
        selectedProviderEntry: unavailableProvider,
      }),
    ).toContain("not ready");
  });

  it("treats empty live providers as loading when settings have enabled providers", () => {
    expect(
      getT3TeamKickoffProviderBlocker({
        isConnected: true,
        hasConfiguredProviders: true,
        providerInstanceEntries: [],
        selectedProviderEntry: undefined,
      }),
    ).toContain("Loading provider status");
  });

  it("detects configured providers from provider instances", () => {
    const personal = ProviderInstanceId.make("codex_personal");
    const codex = ProviderDriverKind.make("codex");
    expect(
      hasConfiguredProviderSettings({
        providerInstances: { [personal]: { driver: codex, enabled: true } },
      }),
    ).toBe(true);
    expect(
      hasConfiguredProviderSettings({
        providerInstances: { [personal]: { driver: codex, enabled: false } },
      }),
    ).toBe(false);
    expect(hasConfiguredProviderSettings({ providerInstances: {} })).toBe(false);
  });
});
