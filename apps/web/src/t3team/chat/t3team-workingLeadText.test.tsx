// @effect-diagnostics nodeBuiltinImport:off - the CSS contract test reads index.css from disk
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { WorkingLeadText } from "./t3team-workingLeadText";

/**
 * P0 (white-on-white working-row label): the shimmer gradient is painted via
 * background-clip: text + a transparent fill. That only reaches text the
 * element DIRECTLY holds. If the class ever lands on a wrapper around the
 * animated SplitFlipText spans again, those spans get their own compositing
 * layers in Chromium, the wrapper's clipped background cannot reach into
 * them, and the inherited transparent fill renders the glyphs invisible.
 * These tests pin the invariant: every .t3team-label-shimmer element is a
 * text leaf, and the CSS carries a solid-color safety net.
 */

/** Future timestamp → the elapsed timer floors to 0s, so the expected
 *  leaf text is deterministic. */
const CREATED_AT = new Date(Date.now() + 60_000).toISOString();

/** Matches every <span ... class="...t3team-label-shimmer..."> whose
 *  content is ONLY text (no nested tags) — i.e. a true text leaf. */
const LEAF_SPAN_RE = /<span[^>]*class="[^"]*t3team-label-shimmer[^"]*"[^>]*>([^<]*)<\/span>/g;

const CLASS_OCCURRENCE_RE = /class="[^"]*t3team-label-shimmer[^"]*"/g;

describe("WorkingLeadText", () => {
  it("paints the shimmer on leaf text spans only, never on a wrapper around the flip spans", () => {
    const markup = renderToStaticMarkup(
      <WorkingLeadText stateWord="Thinking" createdAt={CREATED_AT} shimmer />,
    );

    // All three pieces carry the shimmer class themselves…
    const leaves = [...markup.matchAll(LEAF_SPAN_RE)].map((m) => m[1]);
    expect(leaves).toEqual(["Thinking", " for ", "0s"]);
    // …and every occurrence of the class must be exactly one of those
    // leaves — a wrapper around the flip spans would add an occurrence
    // that is not a text leaf.
    const total = markup.match(CLASS_OCCURRENCE_RE)?.length ?? 0;
    expect(total).toBe(leaves.length);
  });

  it("renders plain text when shimmer is off", () => {
    const markup = renderToStaticMarkup(
      <WorkingLeadText stateWord="Working" createdAt={CREATED_AT} />,
    );
    expect(markup).not.toContain("t3team-label-shimmer");
    expect(markup).toContain(">Working</span>");
  });
});

describe("t3team-label-shimmer CSS contract (apps/web/src/index.css)", () => {
  const indexCss = readFileSync(fileURLToPath(new URL("../../index.css", import.meta.url)), "utf8");

  const supportsIdx = indexCss.indexOf(
    "@supports ((-webkit-background-clip: text) or (background-clip: text))",
  );

  it("keeps a solid base-tone color fallback on the base rule", () => {
    // The base rule (outside @supports) must set the solid fallback color;
    // comments between declarations are expected.
    const ruleIdx = indexCss.indexOf(".t3team-label-shimmer {");
    expect(ruleIdx).toBeGreaterThan(-1);
    const rule = indexCss.slice(ruleIdx, indexCss.indexOf("}", ruleIdx));
    expect(rule).toContain("--shimmer-base: #0369a1;");
    expect(rule).toContain("--shimmer-glow: #7dd3fc;");
    expect(rule).toContain("color: var(--shimmer-base);");
    expect(rule).not.toContain("color: transparent");
  });

  it("confines the transparent fill to the @supports block", () => {
    expect(supportsIdx).toBeGreaterThan(-1);
    const before = indexCss.slice(0, supportsIdx);
    // No transparent fill or text-clip anywhere BEFORE the @supports
    // block — the base rule must leave the text painted in the solid tone.
    expect(before).not.toContain("text-fill-color: transparent");
    expect(before).not.toMatch(/\.t3team-label-shimmer\s*\{[^}]*color:\s*transparent/);

    // The @supports block still does the real thing.
    const blockEnd = indexCss.indexOf("\n}", supportsIdx);
    const block = indexCss.slice(supportsIdx, blockEnd);
    expect(block).toContain("background-clip: text");
    expect(block).toContain("color: transparent");
    expect(block).toContain("animation: t3team-label-shimmer 5.5s ease-in-out infinite");
  });
});
