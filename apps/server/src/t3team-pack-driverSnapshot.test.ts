import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { packSnapshotToServerProvider } from "./t3team-pack-driverSnapshot.ts";
import { resolveSlug } from "./t3team-toolBrokerStartChildProviderSlug.ts";

const baseInput = {
  driverKind: ProviderDriverKind.make("nexplore"),
  instanceId: ProviderInstanceId.make("nexplore"),
  displayName: undefined,
  accentColor: undefined,
  iconDataUrl: undefined,
  continuationKey: "pack:nexplore",
  checkedAt: "2026-09-02T00:00:00.000Z",
};

describe("packSnapshotToServerProvider (GHE nexi-distribution#394)", () => {
  it("treats pack-declared models as built-in unless the pack says otherwise", () => {
    const provider = packSnapshotToServerProvider({
      ...baseInput,
      snapshot: {
        displayName: "Nexplore AI",
        enabled: true,
        installed: true,
        status: "ready",
        authenticated: true,
        models: [
          { slug: "auto", name: "Standard" },
          { slug: "user-added", name: "User added", isCustom: true },
        ],
      },
    });

    expect(provider.models.map((model) => [model.slug, model.isCustom])).toEqual([
      ["auto", false],
      ["user-added", true],
    ]);
  });

  it("forwards the access modes a pack offers and drops ids the host does not know", () => {
    const snapshot = {
      displayName: "Nexplore AI",
      enabled: true,
      installed: true,
      status: "ready" as const,
      models: [],
    };
    const withoutAuto = packSnapshotToServerProvider({
      ...baseInput,
      snapshot: { ...snapshot, supportedRuntimeModes: ["approval-required", "full-access", "x"] },
    });
    expect(withoutAuto.supportedRuntimeModes).toEqual(["approval-required", "full-access"]);
    const unrestricted = packSnapshotToServerProvider({ ...baseInput, snapshot });
    expect(unrestricted.supportedRuntimeModes).toBeUndefined();
  });

  // nx-nexi#1216: a model-less child (machine-setup's workflow agent()) on Nexplore failed with
  // "Provider instance nexplore has no declared default model" because the default was dropped here.
  it("keeps the pack's declared default so a model-less child on the provider runs it", () => {
    const provider = packSnapshotToServerProvider({
      ...baseInput,
      snapshot: {
        displayName: "Nexplore AI",
        enabled: true,
        installed: true,
        status: "ready",
        authenticated: true,
        models: [
          { slug: "auto", name: "Auto" },
          { slug: "no-thinking", name: "Instant" },
          { slug: "medium", name: "Standard", isDefault: true },
          { slug: "high", name: "Deep" },
        ],
      },
    });
    expect(provider.models.filter((model) => model.isDefault === true).map((m) => m.slug)).toEqual([
      "medium",
    ]);
    expect(provider.models.find((model) => model.slug === "auto")).not.toHaveProperty("isDefault");
    const parent = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "sonnet" };
    expect(resolveSlug(provider, undefined, parent)).toEqual({ ok: true, slug: "medium" });
  });

  it("still fails a model-less child when the pack declares no default", () => {
    const provider = packSnapshotToServerProvider({
      ...baseInput,
      snapshot: {
        displayName: "Nexplore AI",
        enabled: true,
        installed: true,
        status: "ready",
        models: [{ slug: "medium", name: "Standard" }],
      },
    });
    const parent = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "sonnet" };
    const result = resolveSlug(provider, undefined, parent);
    expect(result.ok).toBe(false);
  });
});
