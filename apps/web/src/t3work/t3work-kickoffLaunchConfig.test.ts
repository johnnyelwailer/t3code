import { describe, expect, it } from "vite-plus/test";
import type { ProviderInstanceEntry } from "~/providerInstances";
import {
  getT3workKickoffProviderBlocker,
  hasConfiguredProviderSettings,
} from "./t3work-kickoffLaunchConfig";

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

  it("treats empty live providers as loading when settings have enabled providers", () => {
    expect(
      getT3workKickoffProviderBlocker({
        isConnected: true,
        hasConfiguredProviders: true,
        providerInstanceEntries: [],
        selectedProviderEntry: undefined,
      }),
    ).toContain("Loading provider status");
  });

  it("detects configured providers from explicit and legacy settings", () => {
    expect(
      hasConfiguredProviderSettings({
        providerInstances: {},
        providers: { codex: { enabled: true } },
      }),
    ).toBe(true);
    expect(
      hasConfiguredProviderSettings({
        providerInstances: { codex_personal: { enabled: true } },
        providers: { codex: { enabled: false } },
      }),
    ).toBe(true);
    expect(
      hasConfiguredProviderSettings({
        providerInstances: {},
        providers: { codex: { enabled: false } },
      }),
    ).toBe(false);
  });
});
