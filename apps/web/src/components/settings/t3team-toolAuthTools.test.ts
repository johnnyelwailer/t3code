import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { TOOL_AUTH_TOOLS, toolAuthMetaForTool, toolAuthToolForDriverKind } from "./t3team-toolAuthTools";

describe("TOOL_AUTH_TOOLS", () => {
  it("has exactly one entry per tool id, with a label, description, and icon", () => {
    const ids = TOOL_AUTH_TOOLS.map((meta) => meta.tool);
    expect(new Set(ids).size).toBe(ids.length);
    for (const meta of TOOL_AUTH_TOOLS) {
      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.description.trim().length).toBeGreaterThan(0);
      expect(typeof meta.icon).toBe("function");
    }
  });

  it("includes the GHE gh login as a connected tool", () => {
    const gh = TOOL_AUTH_TOOLS.find((meta) => meta.tool === "gh");
    expect(gh).toBeDefined();
    expect(gh?.label).toBe("GitHub");
    // The card's idle body renders this verbatim — it must say what the
    // sign-in actually grants (the GHE host), not just "sign in".
    expect(gh?.description).toContain("nexplore.ghe.com");
  });

  it("resolves every tool id through toolAuthMetaForTool", () => {
    for (const meta of TOOL_AUTH_TOOLS) {
      expect(toolAuthMetaForTool(meta.tool)).toBe(meta);
    }
  });
});

describe("toolAuthToolForDriverKind", () => {
  it("maps the provider drivers to their tools, and nothing else", () => {
    expect(toolAuthToolForDriverKind(ProviderDriverKind.make("claudeAgent"))).toBe("claude");
    expect(toolAuthToolForDriverKind(ProviderDriverKind.make("codex"))).toBe("codex");
    // gh signs in the GHE CLI but is not a provider driver — the model picker
    // must never offer it as a connect affordance.
    expect(toolAuthToolForDriverKind(ProviderDriverKind.make("gh"))).toBeUndefined();
    expect(toolAuthToolForDriverKind(ProviderDriverKind.make("cursor"))).toBeUndefined();
  });
});
