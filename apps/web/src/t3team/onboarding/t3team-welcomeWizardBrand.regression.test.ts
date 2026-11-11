// @effect-diagnostics nodeBuiltinImport:off - regression guard reads component source from disk.
/**
 * Static regression guard for the upstream Welcome page (`WelcomePage.tsx`): it must title itself
 * from the pack (`useWelcomeWizardBrand`), not with upstream's hard-wired "T3 Code". A Nexi Work
 * build showed "Welcome to T3 Code". Upstream syncs rewrite this file, which is why it is pinned.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const PAGE_PATH = NodePath.resolve(
  import.meta.dirname,
  "../../components/onboarding/WelcomePage.tsx",
);

describe("welcome page regression guard", () => {
  const source = NodeFS.readFileSync(PAGE_PATH, "utf8");

  it("takes its product name from the pack brand", () => {
    expect(source).toMatch(/Welcome to \{productName\}/);
    expect(source).not.toMatch(/Welcome to T3 Code/);
    expect(source).not.toMatch(/"T3 Code collects/);
  });
});
