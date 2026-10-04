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
});
