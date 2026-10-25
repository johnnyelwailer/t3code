import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveComposerProviderSelection } from "./components/ChatView.logic";
import { deriveProviderInstanceEntries } from "./providerInstances";
import { resolveReadyProviderOverride } from "./t3team-readyProviderPreference";

const now = "2026-10-24T00:00:00.000Z";

function entry(driver: string, overrides: Partial<ServerProvider> = {}) {
  return deriveProviderInstanceEntries([
    {
      driver: ProviderDriverKind.make(driver),
      instanceId: ProviderInstanceId.make(driver),
      enabled: true,
      installed: true,
      status: "ready",
      auth: { status: "authenticated" },
      version: null,
      checkedAt: now,
      models: [],
      slashCommands: [],
      skills: [],
      ...overrides,
    },
  ])[0]!;
}

// A cloud session VM: Codex is not installed, only the Nexplore AI provider can run.
const codexMissing = entry("codex", { installed: false, status: "error" });
const nexplore = entry("nexplore");
const entries = [codexMissing, nexplore];
const id = (value: string) => ProviderInstanceId.make(value);

describe("resolveReadyProviderOverride", () => {
  it("replaces a requested provider that cannot start with the first ready one", () => {
    expect(
      resolveReadyProviderOverride({ entries, candidateInstanceIds: [id("codex")] })?.instanceId,
    ).toBe(id("nexplore"));
  });

  it("keeps a requested provider that is ready, or still being probed", () => {
    expect(
      resolveReadyProviderOverride({ entries, candidateInstanceIds: [id("nexplore")] }),
    ).toBeUndefined();
    const probing = entry("codex", { status: "warning" });
    expect(
      resolveReadyProviderOverride({
        entries: [probing, nexplore],
        candidateInstanceIds: [id("codex")],
      }),
    ).toBeUndefined();
  });

  it("keeps the failing provider when nothing else is ready", () => {
    expect(
      resolveReadyProviderOverride({
        entries: [codexMissing, entry("other", { status: "error" })],
        candidateInstanceIds: [id("codex")],
      }),
    ).toBeUndefined();
  });

  it("ignores a disabled or unavailable requested provider (the usual fallback handles it)", () => {
    const disabled = entry("codex", { status: "error", enabled: false });
    expect(
      resolveReadyProviderOverride({
        entries: [disabled, nexplore],
        candidateInstanceIds: [id("codex")],
      }),
    ).toBeUndefined();
  });
});

describe("resolveComposerProviderSelection with preferReadyProvider", () => {
  const base = {
    entries,
    candidateInstanceIds: [id("codex")],
    lockedProvider: null,
    lockedInstanceId: null,
  };

  it("lands a new thread on the ready provider instead of the one with the error banner", () => {
    expect(
      resolveComposerProviderSelection({ ...base, preferReadyProvider: true }).selectedProviderEntry
        ?.instanceId,
    ).toBe(id("nexplore"));
  });

  it("leaves upstream behaviour when the flag is off: the requested provider stays", () => {
    expect(resolveComposerProviderSelection(base).selectedProviderEntry?.instanceId).toBe(
      id("codex"),
    );
    expect(
      resolveComposerProviderSelection({ ...base, preferReadyProvider: false })
        .selectedProviderEntry?.instanceId,
    ).toBe(id("codex"));
  });

  it("never moves a thread locked to its provider", () => {
    expect(
      resolveComposerProviderSelection({
        ...base,
        lockedProvider: ProviderDriverKind.make("codex"),
        lockedInstanceId: id("codex"),
        preferReadyProvider: true,
      }).selectedProviderEntry?.instanceId,
    ).toBe(id("codex"));
  });
});
