// @effect-diagnostics nodeBuiltinImport:off - Regression coverage asserts the narrow-panel clamp rules in t3team-index-aciLead.css.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

describe("t3team working row lead slot", () => {
  it("keeps the lead slot's clamp + per-piece ellipsis in .t3team-aci-lead (GHE #208 follow-up)", () => {
    const css = NodeFS.readFileSync(
      NodeURL.fileURLToPath(
        new NodeURL.URL("../../t3team/t3team-index-aciLead.css", import.meta.url),
      ),
      "utf8",
    );
    const rule = css.match(/\.t3team-aci-lead\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("display: inline-flex");
    expect(rule).toContain("overflow: hidden");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("transition: width 480ms");
    // No percentage max-width declaration (circular in an auto-basis flex item).
    expect(rule.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("max-width:");
    // No JS-measured px width either: the clamp stays owned by CSS.
    expect(css).not.toContain("t3team-aci-lead-sizer");
    const wordRule = css.match(/\.t3team-aci-lead-word\s*\{[^}]*\}/)?.[0] ?? "";
    const timerRule = css.match(/\.t3team-aci-lead-timer\s*\{[^}]*\}/)?.[0] ?? "";
    const joinRule = css.match(/\.t3team-aci-lead-join\s*\{[^}]*\}/)?.[0] ?? "";
    // The duration must survive truncation: the word is the ONLY shrink point.
    expect(wordRule).toContain("min-width: 0");
    expect(wordRule).toContain("text-overflow: ellipsis");
    expect(timerRule).toContain("flex-shrink: 0");
    expect(joinRule).toContain("flex-shrink: 0");
  });
});
