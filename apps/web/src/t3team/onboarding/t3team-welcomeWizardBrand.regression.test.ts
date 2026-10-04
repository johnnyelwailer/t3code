// @effect-diagnostics nodeBuiltinImport:off - regression guard reads component source from disk.
/**
 * Static regression guard for the upstream welcome wizard (`WelcomeWizard.tsx`):
 *
 * 1. It must title and brand itself from the pack (`useWelcomeWizardBrand`), not with upstream's
 *    hard-wired "T3 Code". A Nexi Work build showed "Set up T3 Code" with the T3 wordmark.
 * 2. Its tall `size="sm-multiline"` rows must repeat their height at the `sm` breakpoint. The size
 *    carries `sm:min-h-7`, which outranks a bare `min-h-14` from `sm` up, so the "Add a computer"
 *    row rendered 26px tall instead of 56px (measured with getComputedStyle, 2026-09-27).
 *
 * Upstream syncs rewrite this file, which is why both are pinned here.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const WIZARD_PATH = NodePath.resolve(
  import.meta.dirname,
  "../../components/onboarding/WelcomeWizard.tsx",
);

describe("welcome wizard regression guard", () => {
  const source = NodeFS.readFileSync(WIZARD_PATH, "utf8");

  it("takes its title and identity from the pack brand", () => {
    expect(source).toMatch(/title=\{`Set up \$\{brand\.productName\}`\}/);
    expect(source).toMatch(/identity=\{\s*brand\.identity \?\?/);
    expect(source).not.toMatch(/"Set up T3 Code"/);
    expect(source).not.toMatch(/Keep T3 Code running|Start T3 Code first/);
  });

  it("keeps every tall multiline row tall at the sm breakpoint", () => {
    const rows = [...source.matchAll(/size="sm-multiline"[\s\S]{0,300}?className="([^"]*)"/g)]
      .map((match) => match[1] ?? "")
      .filter((className) => /(^|\s)min-h-(?!0\b)/.test(className));
    expect(rows.length).toBeGreaterThan(0);
    for (const className of rows) {
      const base = /(?:^|\s)min-h-(\S+)/.exec(className)?.[1];
      expect(className).toContain(`sm:min-h-${base}`);
    }
  });
});
