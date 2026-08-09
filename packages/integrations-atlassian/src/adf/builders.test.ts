import { describe, expect, it } from "vite-plus/test";
import {
  bulletList,
  docFromBlocks,
  expand,
  heading,
  link,
  panel,
  paragraph,
  table,
} from "./builders.ts";

describe("adf-builders", () => {
  it("builds a panel node with type and content", () => {
    const node = panel("warning", [paragraph("careful")]);
    expect(node).toEqual({
      type: "panel",
      attrs: { panelType: "warning" },
      content: [paragraph("careful")],
    });
  });

  it("builds an expand node with title and content", () => {
    const node = expand("Details", [paragraph("body")]);
    expect(node.type).toBe("expand");
    expect(node.attrs).toEqual({ title: "Details" });
    expect(node.content).toEqual([paragraph("body")]);
  });

  it("builds a heading node clamped to 1-6", () => {
    expect(heading(2, "Title")).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Title" }],
    });
    expect(heading(0, "Title").attrs).toEqual({ level: 1 });
    expect(heading(99, "Title").attrs).toEqual({ level: 6 });
  });

  it("builds a paragraph node", () => {
    expect(paragraph("hi")).toEqual({ type: "paragraph", content: [{ type: "text", text: "hi" }] });
  });

  it("empty-string paragraph/heading yield no empty text nodes (B2)", () => {
    expect(paragraph("")).toEqual({ type: "paragraph", content: [] });
    expect(heading(2, "")).toEqual({ type: "heading", attrs: { level: 2 }, content: [] });
  });

  it("builds a table with header and body rows", () => {
    const node = table([
      ["Agent", "Verdict"],
      ["claude", "ok"],
    ])!;
    expect(node.type).toBe("table");
    expect(node.content).toHaveLength(2);
    expect(node.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
    expect(node.content?.[1]?.content?.[0]?.type).toBe("tableCell");
    expect(node.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]).toEqual({
      type: "text",
      text: "claude",
    });
  });

  it("returns undefined for no rows — empty table content is invalid ADF (B3)", () => {
    expect(table([])).toBeUndefined();
  });

  it("accepts rich CellSpec cells with background/colspan/rowspan/colwidth", () => {
    const node = table([
      [{ content: [paragraph("H")], background: "#deebff" }],
      [{ content: [paragraph("c")], colspan: 2, rowspan: 1, colwidth: [120, 120] }],
    ])!;
    expect(node.content?.[0]?.content?.[0]?.attrs).toEqual({ background: "#deebff" });
    expect(node.content?.[1]?.content?.[0]?.attrs).toEqual({
      colspan: 2,
      rowspan: 1,
      colwidth: [120, 120],
    });
  });

  it("builds a bullet list from items, skipping empty strings (B2)", () => {
    const node = bulletList(["a", "", "b"]);
    expect(node.type).toBe("bulletList");
    expect(node.content).toHaveLength(2);
    expect(node.content?.[0]?.type).toBe("listItem");
  });

  it("builds a link text node", () => {
    expect(link("Spec", "https://example.com")).toEqual({
      type: "text",
      text: "Spec",
      marks: [{ type: "link", attrs: { href: "https://example.com" } }],
    });
  });

  it("link() throws on empty text", () => {
    expect(() => link("", "https://example.com")).toThrow(TypeError);
  });

  it("assembles blocks into a doc", () => {
    const doc = docFromBlocks([paragraph("hi")]);
    expect(doc).toEqual({ type: "doc", version: 1, content: [paragraph("hi")] });
  });
});
