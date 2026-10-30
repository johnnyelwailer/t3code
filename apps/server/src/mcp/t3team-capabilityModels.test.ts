import { describe, expect, it } from "vite-plus/test";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { listCapabilityModels } from "./t3team-capabilityModels.ts";

const model = (slug: string, extra: Partial<ServerProviderModel> = {}): ServerProviderModel => ({
  slug,
  name: slug,
  isCustom: false,
  capabilities: null,
  ...extra,
});
const models = [
  ...Array.from({ length: 10 }, (_, index) => model(`current-${index}`)),
  ...Array.from({ length: 10 }, (_, index) => model(`old-${index}`, { isLegacy: true })),
  model("private", { isCustom: true, isLegacy: true }),
  model("unknown"),
];
const list = (overrides: Partial<Parameters<typeof listCapabilityModels>[0]> = {}) =>
  listCapabilityModels({
    provider: {
      instanceId: ProviderInstanceId.make("opencode"),
      driver: ProviderDriverKind.make("opencode"),
      models,
    },
    latestOnly: true,
    preferences: undefined,
    isPinned: (entry) => entry.isCustom,
    searchTerms: [],
    ...overrides,
  });

describe("capability catalog visibility", () => {
  it("includes all legacy models on opt-in without consuming the current shortlist", () => {
    const result = list({ includeLegacy: true });
    expect(result.listed.map((entry) => entry.slug)).toEqual([
      ...models.slice(0, 8).map((entry) => entry.slug),
      ...models.slice(10, 21).map((entry) => entry.slug),
    ]);
    expect(result.omitted).toBe(3);
  });

  it("preserves hidden preferences and model order, including on legacy opt-in", () => {
    const result = list({
      includeLegacy: true,
      preferences: {
        hiddenModels: ["current-0", "old-0", "private"],
        modelOrder: ["old-2", "current-9"],
      },
    });
    expect(result.listed[0]?.slug).toBe("old-2");
    expect(result.listed[1]?.slug).toBe("current-9");
    expect(result.listed.map((entry) => entry.slug)).not.toContain("old-0");
    expect(result.listed.map((entry) => entry.slug)).not.toContain("current-0");
    expect(result.listed.map((entry) => entry.slug)).toContain("private");
  });

  it("keeps custom models even if a provider attaches a stale legacy classification", () => {
    expect(list().listed.map((entry) => entry.slug)).toContain("private");
  });

  it("keeps existing search matching and limits with the opt-in", () => {
    expect(list({ searchTerms: ["old"] }).listed).toEqual([]);
    const result = list({ includeLegacy: true, searchTerms: ["old"] });
    expect(result.listed.map((entry) => entry.slug)).toEqual(
      models.slice(10, 18).map((entry) => entry.slug),
    );
    expect(result.omitted).toBe(2);
  });
});
