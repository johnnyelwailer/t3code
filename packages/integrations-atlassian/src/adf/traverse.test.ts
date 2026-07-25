import { describe, expect, it } from "vite-plus/test";
import { collectAdfNodeTypes, extractAdfText, walkAdf } from "./traverse.ts";
import { docFromBlocks, heading, paragraph } from "./builders.ts";
import { panel } from "./nodes.ts";

describe("walkAdf", () => {
  it("visits every node depth-first, parent before children", () => {
    const doc = docFromBlocks([heading(2, "Title"), paragraph("Body")]);
    const visited: string[] = [];
    walkAdf(doc, (node) => visited.push(node.type));
    expect(visited).toEqual(["doc", "heading", "text", "paragraph", "text"]);
  });

  it("visits into nested block content (panels)", () => {
    const doc = docFromBlocks([panel("info", [paragraph("nested")])]);
    const visited: string[] = [];
    walkAdf(doc, (node) => visited.push(node.type));
    expect(visited).toEqual(["doc", "panel", "paragraph", "text"]);
  });
});

describe("collectAdfNodeTypes", () => {
  it("collects every distinct type present in the document", () => {
    const doc = docFromBlocks([heading(1, "H"), paragraph("P"), panel("warning", [paragraph("in panel")])]);
    expect(collectAdfNodeTypes(doc)).toEqual(new Set(["doc", "heading", "text", "paragraph", "panel"]));
  });

  it("returns a single-entry set for a doc with no content", () => {
    const doc = docFromBlocks([]);
    expect(collectAdfNodeTypes(doc)).toEqual(new Set(["doc"]));
  });
});

describe("extractAdfText", () => {
  it("flattens text leaves in document order", () => {
    const doc = docFromBlocks([heading(2, "Title"), paragraph("Body text")]);
    expect(extractAdfText(doc)).toBe("TitleBody text");
  });

  it("returns an empty string for null/undefined/non-object input", () => {
    expect(extractAdfText(null)).toBe("");
    expect(extractAdfText(undefined)).toBe("");
    expect(extractAdfText(42)).toBe("");
  });

  it("returns the string unchanged when given a plain string", () => {
    expect(extractAdfText("plain")).toBe("plain");
  });
});
