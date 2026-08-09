import { describe, expect, it } from "vite-plus/test";
import { markdownToAdf } from "./markdownToAdf.ts";

interface DocNode {
  type: string;
  content: AdfLike[];
  version?: number;
}
interface AdfLike {
  type: string;
  content?: AdfLike[];
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Array<Record<string, unknown>>;
}

describe("markdownToAdf", () => {
  it("converts paragraphs, headings, lists, code blocks, bold, links, and hr", () => {
    const result = markdownToAdf(
      "# Header\n\nParagraph with **bold** and [link](https://example.com)\n\n- One\n- Two\n\n```js\nconst x = 1;\n```\n\n---",
    );
    expect(result).toBeTruthy();
    const doc = result as unknown as DocNode;
    expect(doc.type).toBe("doc");
    expect(doc.content.length).toBeGreaterThan(0);
  });

  it("B1: doc includes version: 1", () => {
    const doc = markdownToAdf("hello") as unknown as DocNode;
    expect(doc.version).toBe(1);
  });

  it("B2: never emits empty text nodes for blank inline runs", () => {
    const doc = markdownToAdf("**bold**") as unknown as DocNode;
    const paragraph = doc.content[0];
    for (const node of paragraph?.content ?? []) {
      if (node.type === "text") expect(node.text).not.toBe("");
    }
  });

  it("B4: accumulates plain-text runs into one text node instead of char-by-char", () => {
    const doc = markdownToAdf("hello world") as unknown as DocNode;
    const paragraph = doc.content[0];
    expect(paragraph?.content).toHaveLength(1);
    expect(paragraph?.content?.[0]).toEqual({ type: "text", text: "hello world" });
  });

  it("supports h1-h6 without clamping to 2-4", () => {
    const doc = markdownToAdf("# H1\n\n###### H6") as unknown as DocNode;
    expect((doc.content[0]?.attrs as { level: number }).level).toBe(1);
    expect((doc.content[1]?.attrs as { level: number }).level).toBe(6);
  });

  it("parses markdown tables into ADF table nodes with a header row", () => {
    const doc = markdownToAdf("| A | B |\n|---|---|\n| 1 | 2 |") as unknown as DocNode;
    const table = doc.content[0];
    expect(table?.type).toBe("table");
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
    expect(table?.content?.[1]?.content?.[0]?.type).toBe("tableCell");
  });

  it("parses blockquotes", () => {
    const doc = markdownToAdf("> Quoted text") as unknown as DocNode;
    expect(doc.content[0]?.type).toBe("blockquote");
    expect(doc.content[0]?.content?.[0]?.type).toBe("paragraph");
  });

  it("parses strikethrough", () => {
    const doc = markdownToAdf("~~gone~~") as unknown as DocNode;
    const text = doc.content[0]?.content?.[0];
    expect(text?.marks).toEqual([{ type: "strike" }]);
  });

  it("parses task items into a taskList", () => {
    const doc = markdownToAdf("- [ ] Todo item\n- [x] Done item") as unknown as DocNode;
    const list = doc.content[0];
    expect(list?.type).toBe("taskList");
    expect(list?.attrs).toHaveProperty("localId");
    expect(list?.content).toHaveLength(2);
    expect((list?.content?.[0]?.attrs as { state: string }).state).toBe("TODO");
    expect((list?.content?.[1]?.attrs as { state: string }).state).toBe("DONE");
  });

  it("captures fenced code language into codeBlock attrs", () => {
    const doc = markdownToAdf("```typescript\nconst x = 1;\n```") as unknown as DocNode;
    expect(doc.content[0]?.type).toBe("codeBlock");
    expect(doc.content[0]?.attrs).toEqual({ language: "typescript" });
  });

  it("parses multi-node inline runs combining bold, code, and link on one line", () => {
    const doc = markdownToAdf(
      "**bold** then `code` then [link](https://x.example)",
    ) as unknown as DocNode;
    const nodes = doc.content[0]?.content ?? [];
    expect(nodes.some((n) => n.marks?.[0]?.type === "strong")).toBe(true);
    expect(nodes.some((n) => n.marks?.[0]?.type === "code")).toBe(true);
    expect(nodes.some((n) => n.marks?.[0]?.type === "link")).toBe(true);
  });
});
