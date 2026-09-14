import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildRuntimeModelCatalog } from "./t3team-runtimeModelCatalog.ts";

const provider = (instanceId: string, driver: string, models: ReadonlyArray<string>) =>
  ({
    instanceId,
    driver,
    displayName: `${driver} runtime`,
    availability: "available",
    enabled: true,
    installed: true,
    status: "ready",
    auth: { status: "authenticated" },
    models: models.map((slug, index) => ({
      slug,
      name: `Runtime ${slug}`,
      isCustom: false,
      isDefault: index === 0,
      capabilities: null,
    })),
  }) as unknown as ServerProvider;

describe("buildRuntimeModelCatalog", () => {
  it("projects arbitrary runtime instances and marks the true current selection", () => {
    const current = {
      instanceId: "team-codex",
      model: "future-model-from-runtime",
      options: [{ id: "effort", value: "high" }],
    } as unknown as ModelSelection;
    const catalog = buildRuntimeModelCatalog(current, [
      provider("team-codex", "custom-driver", ["future-model-from-runtime", "other-live-model"]),
    ]);

    expect(catalog.currentSelection).toEqual({
      instanceId: "team-codex",
      model: "future-model-from-runtime",
      options: [{ id: "effort", value: "high" }],
    });
    expect(catalog.providers[0]).toMatchObject({
      instanceId: "team-codex",
      driver: "custom-driver",
      selected: true,
      models: [
        { slug: "future-model-from-runtime", selected: true },
        { slug: "other-live-model", selected: false },
      ],
    });
  });

  it("returns an empty live catalog without inventing fallback providers or models", () => {
    expect(buildRuntimeModelCatalog(undefined, [])).toMatchObject({
      currentSelection: null,
      providers: [],
    });
  });
});
