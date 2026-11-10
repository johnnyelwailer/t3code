import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { packSnapshotToServerProvider } from "./t3team-pack-driverSnapshot.ts";

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

  it("forwards a pack's live usage stats and drops malformed entries", () => {
    const snapshot = {
      displayName: "Nexplore AI",
      enabled: true,
      installed: true,
      status: "ready" as const,
      models: [],
    };
    const provider = packSnapshotToServerProvider({
      ...baseInput,
      snapshot: {
        ...snapshot,
        usageStats: [
          { id: "running", label: "Running", value: "15 / 32", usedPercent: 46.9, detail: "x" },
          { id: "queued", label: "Queued", value: "1" },
          { id: "over", label: "Over", value: "9", usedPercent: 140 },
          { id: "", label: "No id", value: "1" },
          { id: "blank", label: "Blank", value: "  " },
        ],
      },
    });
    expect(provider.usageStats).toEqual([
      { id: "running", label: "Running", value: "15 / 32", usedPercent: 46.9, detail: "x" },
      { id: "queued", label: "Queued", value: "1" },
      { id: "over", label: "Over", value: "9", usedPercent: 100 },
    ]);
    expect(provider.usageLimits).toBeUndefined();
    expect(packSnapshotToServerProvider({ ...baseInput, snapshot }).usageStats).toBeUndefined();
    expect(
      packSnapshotToServerProvider({ ...baseInput, snapshot: { ...snapshot, usageStats: [] } })
        .usageStats,
    ).toBeUndefined();
  });
});
