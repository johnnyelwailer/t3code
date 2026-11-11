import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "./providerInstances";
import { applyProviderSelectionFallbackRule } from "./t3team-providerSelectionFallback";

function entry(driver: string, overrides: Partial<ServerProvider> = {}) {
  return deriveProviderInstanceEntries([
    {
      driver: ProviderDriverKind.make(driver),
      instanceId: ProviderInstanceId.make(driver),
      displayName: driver === "nexplore" ? "Nexplore AI" : driver,
      enabled: true,
      installed: true,
      status: "ready",
      auth: { status: "authenticated" },
      version: null,
      checkedAt: "2026-10-24T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
      ...overrides,
    },
  ])[0]!;
}

const claude = entry("claudeAgent", { installed: false, status: "error" });
const codex = entry("codex");
const nexplore = entry("nexplore");

describe("applyProviderSelectionFallbackRule", () => {
  it("keeps the provider the user picked when something else was resolved for it", () => {
    const result = applyProviderSelectionFallbackRule({
      requestedEntry: claude,
      resolvedEntry: codex,
    });
    expect(result.entry?.instanceId).toBe(claude.instanceId);
    expect(result.fallback).toBeNull();
  });

  it("lets another instance of the same driver stand in, and reports it: never silent", () => {
    const claudeTeam = entry("claudeAgent", {
      instanceId: ProviderInstanceId.make("claude_team"),
      displayName: "Claude Team",
    });
    const result = applyProviderSelectionFallbackRule({
      requestedEntry: claude,
      resolvedEntry: claudeTeam,
    });
    expect(result.entry?.instanceId).toBe(claudeTeam.instanceId);
    expect(result.fallback).toEqual({
      kind: "sameDriver",
      requestedInstanceId: claude.instanceId,
      requestedDisplayName: claude.displayName,
      fallbackInstanceId: claudeTeam.instanceId,
      fallbackDisplayName: "Claude Team",
    });
  });

  it("allows the swap to Nexplore AI, and reports it so the composer can say so", () => {
    const result = applyProviderSelectionFallbackRule({
      requestedEntry: claude,
      resolvedEntry: nexplore,
    });
    expect(result.entry?.instanceId).toBe(nexplore.instanceId);
    expect(result.fallback).toEqual({
      kind: "nexplore",
      requestedInstanceId: claude.instanceId,
      requestedDisplayName: claude.displayName,
      fallbackInstanceId: nexplore.instanceId,
      fallbackDisplayName: "Nexplore AI",
    });
  });

  it("reports nothing when the resolved provider is the requested one", () => {
    const result = applyProviderSelectionFallbackRule({
      requestedEntry: codex,
      resolvedEntry: codex,
    });
    expect(result.entry?.instanceId).toBe(codex.instanceId);
    expect(result.fallback).toBeNull();
  });

  it("leaves a brand-new thread's default alone: there is no choice to protect", () => {
    const result = applyProviderSelectionFallbackRule({
      requestedEntry: undefined,
      resolvedEntry: codex,
    });
    expect(result.entry?.instanceId).toBe(codex.instanceId);
    expect(result.fallback).toBeNull();
  });

  it("does not invent a selection when nothing resolved", () => {
    expect(
      applyProviderSelectionFallbackRule({ requestedEntry: claude, resolvedEntry: undefined }),
    ).toEqual({ entry: undefined, fallback: null });
  });
});
