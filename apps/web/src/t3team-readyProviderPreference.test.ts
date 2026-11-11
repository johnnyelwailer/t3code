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
  it("replaces a requested provider that cannot start with Nexplore AI", () => {
    expect(
      resolveReadyProviderOverride({ entries, candidateInstanceIds: [id("codex")] })?.instanceId,
    ).toBe(id("nexplore"));
  });

  it("will not hand the thread to whatever else happens to be ready", () => {
    // Pre-fix this returned Gemini, so a Codex thread silently ran somewhere the user never chose.
    expect(
      resolveReadyProviderOverride({
        entries: [codexMissing, entry("gemini")],
        candidateInstanceIds: [id("codex")],
      }),
    ).toBeUndefined();
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

  it("keeps Claude when it reports an error, including an empty cloud auth slot", () => {
    const claude = entry("claudeAgent", {
      status: "error",
      auth: { status: "unauthenticated" },
    });
    expect(
      resolveReadyProviderOverride({
        entries: [claude, nexplore],
        candidateInstanceIds: [id("claudeAgent")],
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

  it("lands a new thread on Nexplore AI instead of the one with the error banner, and says so", () => {
    const selection = resolveComposerProviderSelection({ ...base, preferReadyProvider: true });
    expect(selection.selectedProviderEntry?.instanceId).toBe(id("nexplore"));
    // The swap is allowed only because the composer is handed something to label it with.
    expect(selection.providerFallback).toMatchObject({
      requestedInstanceId: id("codex"),
      fallbackInstanceId: id("nexplore"),
    });
  });

  it("reports no fallback when the requested provider keeps the thread", () => {
    expect(resolveComposerProviderSelection(base).providerFallback).toBeNull();
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

  it("uses the machine's one Claude instance when the picked Claude id is not on it", () => {
    const claude = entry("claudeAgent", {
      status: "error",
      auth: { status: "unauthenticated" },
    });
    expect(
      resolveComposerProviderSelection({
        entries: [nexplore, claude],
        candidateInstanceIds: [id("claudeAgent2")],
        lockedProvider: null,
        lockedInstanceId: null,
        preferReadyProvider: true,
      }).selectedProviderEntry?.instanceId,
    ).toBe(id("claudeAgent"));
  });

  it("keeps a Claude thread when prefer-ready would otherwise move it", () => {
    const claude = entry("claudeAgent", {
      status: "error",
      auth: { status: "unauthenticated" },
    });
    expect(
      resolveComposerProviderSelection({
        entries: [claude, nexplore],
        candidateInstanceIds: [id("claudeAgent")],
        lockedProvider: null,
        lockedInstanceId: null,
        preferReadyProvider: true,
      }).selectedProviderEntry?.instanceId,
    ).toBe(id("claudeAgent"));
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
