import { describe, expect, it } from "vite-plus/test";

import {
  needsComposerBoundarySpace,
  needsComposerLeadingSpace,
} from "./t3team-composerTextBoundary";

describe("needsComposerBoundarySpace", () => {
  it("joins two dictation segments with exactly one space", () => {
    expect(needsComposerBoundarySpace("hello", 5, "world")).toBe(true);
    expect(needsComposerBoundarySpace("hello", 5, " world")).toBe(false);
    expect(needsComposerBoundarySpace("hello ", 6, "world")).toBe(false);
  });

  it("adds no space at the start of the draft or for empty text", () => {
    expect(needsComposerBoundarySpace("", 0, "hello")).toBe(false);
    expect(needsComposerBoundarySpace("hello", 5, "")).toBe(false);
  });

  it("adds no space when the incoming segment starts with punctuation", () => {
    expect(needsComposerBoundarySpace("hello", 5, ", and then")).toBe(false);
    expect(needsComposerBoundarySpace("hello", 5, "„Zweitens“")).toBe(false);
    expect(needsComposerBoundarySpace("hello", 5, "(continued)")).toBe(false);
  });

  it("adds a space when the incoming segment starts with a digit", () => {
    expect(needsComposerBoundarySpace("version", 7, "2 ships")).toBe(true);
  });

  it("reads the boundary at the cursor, not at the end of the string", () => {
    expect(needsComposerBoundarySpace("hello world", 5, "there")).toBe(true);
    expect(needsComposerBoundarySpace("hello world", 6, "there")).toBe(false);
  });

  it("keeps the plain boundary rule for non-voice insertions: a file link after a word gets its space", () => {
    const link = "[index.ts](src/index.ts)";
    expect(needsComposerLeadingSpace({ ensureLeadingBoundary: true }, "Fix", 3, link)).toBe(true);
    expect(needsComposerLeadingSpace({ ensureLeadingBoundary: true }, "Fix ", 4, link)).toBe(false);
    expect(needsComposerLeadingSpace(undefined, "Fix", 3, link)).toBe(false);
  });

  it("applies the punctuation-aware rule only to dictation text", () => {
    const link = "[index.ts](src/index.ts)";
    expect(needsComposerLeadingSpace({ voiceBoundary: true }, "Fix", 3, "world")).toBe(true);
    expect(needsComposerLeadingSpace({ voiceBoundary: true }, "Fix", 3, ", and then")).toBe(false);
    expect(needsComposerLeadingSpace({ voiceBoundary: true }, "Fix", 3, link)).toBe(false);
    expect(needsComposerLeadingSpace({ voiceBoundary: true }, "Fix ", 4, "world")).toBe(false);
  });
});
