import { describe, expect, it } from "vite-plus/test";
import {
  buildDraftDiffParagraphs,
  composeDraftDescription,
  draftDiffParagraphText,
  draftDiffMagnitude,
} from "./t3team-workItemDescriptionDiffModel";

describe("buildDraftDiffParagraphs", () => {
  it("marks unchanged words as plain segments", () => {
    const [paragraph] = buildDraftDiffParagraphs("The quick fox", "The quick fox");
    expect(paragraph?.segments.every((segment) => segment.kind === undefined)).toBe(true);
    expect(paragraph?.state).toBeUndefined();
  });

  it("marks a wholly new paragraph as added", () => {
    const [paragraph] = buildDraftDiffParagraphs(undefined, "Brand new text");
    expect(paragraph?.state).toBe("add");
    expect(
      paragraph?.segments.every((segment) => segment.kind === "add" || segment.text.trim() === ""),
    ).toBe(true);
  });

  it("marks a paragraph with both kept and changed words as edit", () => {
    const [paragraph] = buildDraftDiffParagraphs("Ship the retries", "Ship the retries carefully");
    expect(paragraph?.state).toBe("edit");
  });

  it("keeps paragraphs in the proposed document's order", () => {
    const paragraphs = buildDraftDiffParagraphs(
      "First para\n\nSecond para",
      "First para\n\nSecond para",
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.id).toBe("p0");
    expect(paragraphs[1]?.id).toBe("p1");
  });

  it("reconstructs the proposed text without deleted words", () => {
    const [paragraph] = buildDraftDiffParagraphs("Ship the retries", "Ship the retries carefully");
    expect(paragraph ? draftDiffParagraphText(paragraph) : "").toBe("Ship the retries carefully");
  });

  it("omits paragraphs removed during review", () => {
    const paragraphs = buildDraftDiffParagraphs(undefined, "Keep this\n\nRemove this");
    expect(composeDraftDescription(paragraphs, new Set(["p1"]))).toBe("Keep this");
  });
});

describe("draftDiffMagnitude", () => {
  it("counts added and removed words across all paragraphs", () => {
    const paragraphs = buildDraftDiffParagraphs(
      "Ship the retries",
      "Ship the retries carefully now",
    );
    const magnitude = draftDiffMagnitude(paragraphs);
    expect(magnitude.added).toBeGreaterThan(0);
    expect(magnitude.removed).toBe(0);
  });

  it("reads a brand-new document as all additions, nothing removed", () => {
    const paragraphs = buildDraftDiffParagraphs(undefined, "A whole new comment");
    const magnitude = draftDiffMagnitude(paragraphs);
    expect(magnitude.removed).toBe(0);
    expect(magnitude.added).toBeGreaterThan(0);
  });

  it("is zero for identical text", () => {
    const paragraphs = buildDraftDiffParagraphs("Same text here", "Same text here");
    expect(draftDiffMagnitude(paragraphs)).toEqual({ added: 0, removed: 0 });
  });
});
