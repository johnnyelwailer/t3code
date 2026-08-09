/**
 * Blocking the writer's markdown the way a reviewer reads it.
 *
 * The live defect, from PJ's screenshot of a real NXAI-6 rewrite: blocks reading
 * "Projektkontext. ## Rollen im", then "MVP Dieses Epic umfasst", then "die Rollen: - RE - PO / PPO - Dev",
 * and one block whose first span was literally "\n\n". Two compounding causes — blank-line-only splitting
 * (which markdown's soft line wrapping defeats) and a token-accounting drift in the regroup.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vite-plus/test";

import {
  buildDraftDiffParagraphs,
  draftDiffMagnitude,
} from "~/t3team/workitem/t3team-workItemDescriptionDiffModel";
import { splitT3TeamMarkdownBlocks } from "~/t3team/workitem/t3team-workItemMarkdownBlocks";

/** PJ's shape written with SOFT line breaks — the case blank-line splitting cannot see. */
const SOFT_WRAPPED = [
  "Projektkontext.",
  "## Rollen im MVP",
  "Dieses Epic umfasst",
  "die Rollen:",
  "- RE",
  "- PO / PPO",
  "- Dev",
].join("\n");

/** The same document written with blank lines between blocks. */
const BLANK_LINE_SEPARATED = [
  "Projektkontext.",
  "",
  "## Rollen im MVP",
  "",
  "Dieses Epic umfasst",
  "die Rollen:",
  "",
  "- RE",
  "- PO / PPO",
  "- Dev",
].join("\n");

function blockTexts(text: string): ReadonlyArray<string> {
  return splitT3TeamMarkdownBlocks(text).map((block) => block.text);
}

function paragraphText(segments: ReadonlyArray<{ readonly text: string }>): string {
  return segments.map((segment) => segment.text).join("");
}

describe("splitT3TeamMarkdownBlocks", () => {
  it("gives a heading its own block, even with only soft line breaks around it", () => {
    expect(blockTexts(SOFT_WRAPPED)).toEqual([
      "Projektkontext.",
      "## Rollen im MVP",
      "Dieses Epic umfasst die Rollen:",
      "- RE\n- PO / PPO\n- Dev",
    ]);
  });

  it("blocks the same document identically however the author spaced it", () => {
    expect(blockTexts(BLANK_LINE_SEPARATED)).toEqual(blockTexts(SOFT_WRAPPED));
  });

  it("never glues a heading marker to the previous sentence", () => {
    for (const block of blockTexts(SOFT_WRAPPED)) {
      // "Projektkontext. ## Rollen im" was the live output.
      expect(block.startsWith("##") || !block.includes("##")).toBe(true);
    }
  });

  it("keeps a list together and does not absorb the paragraph introducing it", () => {
    const blocks = splitT3TeamMarkdownBlocks(SOFT_WRAPPED);
    const list = blocks.find((block) => block.kind === "list");

    expect(list?.text.split("\n")).toEqual(["- RE", "- PO / PPO", "- Dev"]);
    expect(list?.text).not.toContain("Dieses Epic");
  });

  it("handles numbered lists and mixed markers", () => {
    expect(blockTexts("Intro:\n1. First\n2) Second\n\n* Bullet")).toEqual([
      "Intro:",
      "1. First\n2) Second",
      "* Bullet",
    ]);
  });

  it("is empty for empty input", () => {
    expect(splitT3TeamMarkdownBlocks("")).toEqual([]);
    expect(splitT3TeamMarkdownBlocks("   \n\n  ")).toEqual([]);
  });
});

describe("buildDraftDiffParagraphs on the writer's markdown", () => {
  it("produces one block per markdown block, with no mid-sentence splits", () => {
    const paragraphs = buildDraftDiffParagraphs(undefined, SOFT_WRAPPED);

    expect(paragraphs.map((paragraph) => paragraphText(paragraph.segments))).toEqual([
      "Projektkontext.",
      "## Rollen im MVP",
      "Dieses Epic umfasst die Rollen:",
      "- RE\n- PO / PPO\n- Dev",
    ]);
  });

  /** The literal artifact PJ selected: a block whose first span was the `\n\n` block joiner. */
  it("never starts a block with a whitespace-only span", () => {
    for (const paragraph of buildDraftDiffParagraphs(undefined, SOFT_WRAPPED)) {
      expect(paragraph.segments[0]?.text.trim()).not.toBe("");
    }
  });

  it("marks a brand-new document as wholly added, whitespace notwithstanding", () => {
    const paragraphs = buildDraftDiffParagraphs(undefined, SOFT_WRAPPED);

    // Every block is new; the spaces between new words must not demote a block to "edit".
    expect(paragraphs.every((paragraph) => paragraph.state === "add")).toBe(true);
  });

  it("keeps an untouched block unmarked and marks only the block that changed", () => {
    const before = "Projektkontext.\n## Rollen im MVP\nDieses Epic umfasst die Rollen:";
    const after = "Projektkontext.\n## Rollen im MVP\nDieses Epic beschreibt die Rollen:";
    const paragraphs = buildDraftDiffParagraphs(before, after);

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]?.state).toBeUndefined();
    expect(paragraphs[1]?.state).toBeUndefined();
    expect(paragraphs[2]?.state).toBe("edit");
    // ...and the edit is the one word, not the whole block.
    expect(draftDiffMagnitude(paragraphs)).toEqual({ added: 1, removed: 1 });
  });

  it("attributes an added block to itself rather than bleeding into its neighbour", () => {
    const before = "Projektkontext.\n\n## Rollen im MVP";
    const after = "Projektkontext.\n\n## Rollen im MVP\n\n- RE\n- PO / PPO";
    const paragraphs = buildDraftDiffParagraphs(before, after);

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]?.state).toBeUndefined();
    expect(paragraphs[1]?.state).toBeUndefined();
    expect(paragraphs[2]?.state).toBe("add");
    expect(paragraphText(paragraphs[2]?.segments ?? [])).toBe("- RE\n- PO / PPO");
  });
});
