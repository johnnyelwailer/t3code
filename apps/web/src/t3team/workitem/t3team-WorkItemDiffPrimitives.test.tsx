/**
 * How a diff is DRAWN. The live DOM PJ selected showed every token — including each space — wrapped in
 * its own padded, rounded, background-filled `<mark>`, which is what made a fully-new paragraph read as a
 * chain of green chips with gaps.
 *
 * @vitest-environment jsdom
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamDiffText } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";
import {
  flattenDiffSegmentKinds,
  isWholeBlockChange,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";

/** What the word differ actually emits: words AND the gaps between them, as separate segments. */
const MIXED_SEGMENTS = [
  { text: "The" },
  { text: " " },
  { text: "agent", kind: "del" as const },
  { text: " " },
  { text: "writer", kind: "add" as const },
  { text: " " },
  { text: "proposes." },
];

const ALL_ADDED_SEGMENTS = [
  { text: "Ich", kind: "add" as const },
  { text: " ", kind: "add" as const },
  { text: "hole", kind: "add" as const },
  { text: " ", kind: "add" as const },
  { text: "Beschreibung.", kind: "add" as const },
];

function countTags(markup: string, tag: string): number {
  return markup.split(`<${tag}`).length - 1;
}

describe("T3TeamDiffText", () => {
  it("never wraps whitespace in a mark, even in a mixed block", () => {
    const markup = renderToStaticMarkup(<T3TeamDiffText segments={MIXED_SEGMENTS} />);

    // One real deletion, one real insertion — and nothing else marked.
    expect(countTags(markup, "del")).toBe(1);
    expect(countTags(markup, "mark")).toBe(1);
    // The regression: a padded, rounded, filled box containing a single space.
    expect(markup).not.toMatch(/<mark[^>]*>\s+<\/mark>/);
    expect(markup).not.toMatch(/<del[^>]*>\s+<\/del>/);
  });

  it("still marks the words that changed", () => {
    const markup = renderToStaticMarkup(<T3TeamDiffText segments={MIXED_SEGMENTS} />);

    expect(markup).toMatch(/<del[^>]*>agent<\/del>/);
    expect(markup).toMatch(/<mark[^>]*>writer<\/mark>/);
  });

  it("marks nothing once a wholly-changed block has been flattened", () => {
    const markup = renderToStaticMarkup(
      <T3TeamDiffText segments={flattenDiffSegmentKinds(ALL_ADDED_SEGMENTS)} />,
    );

    expect(countTags(markup, "mark")).toBe(0);
    expect(countTags(markup, "del")).toBe(0);
    // The prose survives intact, spaces included — no marks, so the text reads as a paragraph.
    expect(markup.replaceAll(/<[^>]+>/g, "")).toContain("Ich hole Beschreibung.");
  });

  it("keeps an anchored comment visible on a flattened block", () => {
    const flattened = flattenDiffSegmentKinds([
      { text: "Ich", kind: "add" as const, commented: true },
    ]);

    expect(flattened[0]).toEqual({ text: "Ich", commented: true });
    expect(renderToStaticMarkup(<T3TeamDiffText segments={flattened} />)).toContain(
      "decoration-dotted",
    );
  });
});

describe("isWholeBlockChange", () => {
  it("is true only when there is no mixture to point at", () => {
    expect(isWholeBlockChange("add")).toBe(true);
    expect(isWholeBlockChange("del")).toBe(true);
    // `edit` is the case word-level marking exists for.
    expect(isWholeBlockChange("edit")).toBe(false);
    expect(isWholeBlockChange(undefined)).toBe(false);
  });
});
