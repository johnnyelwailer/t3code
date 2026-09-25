import { FastCheck as fc } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import {
  compareModelVersions,
  parseModelSlug,
  resolveModelRouting,
} from "./t3team-modelRouting.ts";

const on = { flagOn: true } as const;

describe("parseModelSlug", () => {
  it.each([
    ["gpt-6-sol", { base: "gpt", version: [6], tier: "sol" }],
    ["gpt-5.6-sol", { base: "gpt", version: [5, 6], tier: "sol" }],
    ["claude-opus-5", { base: "claude", version: [5], tier: "opus" }],
    ["claude-opus-5-5", { base: "claude", version: [5, 5], tier: "opus" }],
    ["gpt-6-astra", { base: "gpt", version: [6], tier: "astra" }],
    ["gpt-5.4", { base: "gpt", version: [5, 4], tier: "" }],
    ["gpt-5.1-codex-mini", { base: "gpt", version: [5, 1], tier: "codex-mini" }],
    ["claude-3-5-sonnet", { base: "claude", version: [3, 5], tier: "sonnet" }],
    ["gemini-3.1-pro-high", { base: "gemini", version: [3, 1], tier: "pro-high" }],
    [
      "claude-haiku-4-5-20251001",
      { base: "claude", version: [4, 5], tier: "haiku", date: 20251001 },
    ],
    ["Claude-Opus-4-8", { base: "claude", version: [4, 8], tier: "opus" }],
    ["anthropic/claude-sonnet-4", { base: "anthropic/claude", version: [4], tier: "sonnet" }],
    ["openai.gpt-5.6-sol", { base: "openai.gpt", version: [5, 6], tier: "sol" }],
  ])("parses %s", (slug, expected) => {
    expect(parseModelSlug(slug)).toEqual(expected);
  });

  it.each([
    "custom-model",
    "",
    "   ",
    "gpt",
    "gpt-4o",
    "o3-mini",
    "qwen3:8b",
    "gemini-2.0-flash-001",
    "claude-opus-5-5[1m]",
    "gpt--6",
    "removed-plugin/model",
    "-6",
  ])("rejects %j as unparseable", (slug) => {
    expect(parseModelSlug(slug)).toBeUndefined();
  });

  it("round-trips any generated family/version/tier slug", () => {
    const word = fc.stringMatching(/^[a-z]{1,8}$/);
    fc.assert(
      fc.property(
        word,
        fc.array(fc.nat({ max: 99 }), { minLength: 1, maxLength: 3 }),
        fc.array(word, { maxLength: 2 }),
        fc.boolean(),
        (base, version, tier, dotted) => {
          const versionTokens = dotted ? [version.join(".")] : version.map(String);
          const slug = [base, ...versionTokens, ...tier].join("-");
          expect(parseModelSlug(slug)).toEqual({ base, version, tier: tier.join("-") });
        },
      ),
    );
  });

  it("never throws and only ever returns a non-empty version", () => {
    fc.assert(
      fc.property(fc.string(), (slug) => {
        const parsed = parseModelSlug(slug);
        if (parsed !== undefined) expect(parsed.version.length).toBeGreaterThan(0);
      }),
    );
  });
});

describe("compareModelVersions", () => {
  it("orders tuples lexicographically with missing components as 0", () => {
    expect(compareModelVersions([6], [5, 6])).toBeGreaterThan(0);
    expect(compareModelVersions([5, 5], [5])).toBeGreaterThan(0);
    expect(compareModelVersions([6], [6, 0])).toBe(0);
    expect(compareModelVersions([4, 8], [5, 5])).toBeLessThan(0);
  });
});

describe("resolveModelRouting", () => {
  const openai = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-sol", "gpt-6-astra", "gpt-5.4"];
  const anthropic = ["claude-opus-4-8", "claude-opus-5-5", "claude-sonnet-5", "claude-haiku-4-5"];

  it("routes to the same tier at a newer version", () => {
    expect(resolveModelRouting("gpt-5.6-sol", openai, on)).toEqual({
      requested: "gpt-5.6-sol",
      effective: "gpt-6-sol",
      routed: true,
      reason: "same-tier-newer",
    });
    expect(resolveModelRouting("claude-opus-4-8", anthropic, on).effective).toBe("claude-opus-5-5");
    // A stale slug the catalog no longer lists still upgrades within its tier.
    expect(resolveModelRouting("claude-opus-4-1", anthropic, on).effective).toBe("claude-opus-5-5");
    // Legacy version-first ordering shares the tier.
    expect(resolveModelRouting("claude-3-5-sonnet", anthropic, on).effective).toBe(
      "claude-sonnet-5",
    );
  });

  it("returns the catalog's slug casing when routed", () => {
    expect(resolveModelRouting("GPT-5.6-SOL", openai, on).effective).toBe("gpt-6-sol");
  });

  it("falls back to the family's newest model when the tier is absent", () => {
    expect(resolveModelRouting("gpt-5.6-luna", openai, on)).toEqual({
      requested: "gpt-5.6-luna",
      effective: "gpt-6-sol",
      routed: true,
      reason: "tier-absent-provider-latest",
    });
  });

  it("breaks an equal-version tie by snapshot date, then catalog order", () => {
    expect(
      resolveModelRouting(
        "claude-haiku-3",
        ["claude-haiku-4-20250101", "claude-haiku-4-20260101"],
        on,
      ).effective,
    ).toBe("claude-haiku-4-20260101");
    expect(resolveModelRouting("gpt-5-luna", ["gpt-6-astra", "gpt-6-sol"], on).effective).toBe(
      "gpt-6-astra",
    );
  });

  it("does not route an already-latest or newer-than-catalog slug", () => {
    expect(resolveModelRouting("gpt-6-sol", openai, on)).toEqual({
      requested: "gpt-6-sol",
      effective: "gpt-6-sol",
      routed: false,
      reason: "already-latest",
    });
    expect(resolveModelRouting("claude-opus-9", anthropic, on)).toMatchObject({
      effective: "claude-opus-9",
      routed: false,
      reason: "already-latest",
    });
  });

  it("passes an unparseable slug through unchanged", () => {
    expect(resolveModelRouting("custom-model", openai, on)).toEqual({
      requested: "custom-model",
      effective: "custom-model",
      routed: false,
      reason: "unparseable",
    });
  });

  it("passes through when the catalog is empty or has no entry of the family", () => {
    expect(resolveModelRouting("gpt-5.6-sol", [], on)).toMatchObject({
      effective: "gpt-5.6-sol",
      routed: false,
      reason: "no-catalog-family",
    });
    expect(resolveModelRouting("gpt-5.6-sol", anthropic, on).reason).toBe("no-catalog-family");
    // A namespaced catalog is a different family: never cross a namespace boundary.
    expect(resolveModelRouting("gpt-5.6-sol", ["openai.gpt-6-sol"], on).reason).toBe(
      "no-catalog-family",
    );
  });

  it("never routes with the flag off", () => {
    expect(resolveModelRouting("gpt-5.6-sol", openai, { flagOn: false })).toEqual({
      requested: "gpt-5.6-sol",
      effective: "gpt-5.6-sol",
      routed: false,
      reason: "flag-off",
    });
  });

  it("only ever routes to a slug that is in the catalog, and never backwards in its tier", () => {
    const slug = fc
      .tuple(
        fc.constantFrom("gpt", "claude"),
        fc.array(fc.nat({ max: 9 }), { minLength: 1, maxLength: 2 }),
        fc.constantFrom("sol", "opus", "astra", ""),
      )
      .map(([base, version, tier]) =>
        [base, ...version.map(String), tier].filter(Boolean).join("-"),
      );
    fc.assert(
      fc.property(slug, fc.array(slug, { maxLength: 6 }), (requested, catalog) => {
        const routing = resolveModelRouting(requested, catalog, on);
        if (!routing.routed) {
          expect(routing.effective).toBe(requested);
          return;
        }
        expect(catalog).toContain(routing.effective);
        const from = parseModelSlug(requested)!;
        const to = parseModelSlug(routing.effective)!;
        expect(to.base).toBe(from.base);
        if (routing.reason === "same-tier-newer") {
          expect(to.tier).toBe(from.tier);
          expect(compareModelVersions(to.version, from.version)).toBeGreaterThan(0);
        }
      }),
    );
  });
});
