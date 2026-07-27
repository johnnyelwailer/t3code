import { describe, expect, it } from "vite-plus/test";
import { parseInline } from "./markdownInline.ts";

describe("parseInline", () => {
  it("accumulates plain text runs into a single node (B4)", () => {
    expect(parseInline("hello world")).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("parses bold, italic, code, strike, and links", () => {
    expect(parseInline("**b**")).toEqual([{ type: "text", text: "b", marks: [{ type: "strong" }] }]);
    expect(parseInline("*i*")).toEqual([{ type: "text", text: "i", marks: [{ type: "em" }] }]);
    expect(parseInline("_i_")).toEqual([{ type: "text", text: "i", marks: [{ type: "em" }] }]);
    expect(parseInline("`c`")).toEqual([{ type: "text", text: "c", marks: [{ type: "code" }] }]);
    expect(parseInline("~~s~~")).toEqual([{ type: "text", text: "s", marks: [{ type: "strike" }] }]);
    expect(parseInline("[t](https://x.example)")).toEqual([
      { type: "text", text: "t", marks: [{ type: "link", attrs: { href: "https://x.example" } }] },
    ]);
  });

  it("returns an empty array for an empty line", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("mixes plain and marked runs on one line", () => {
    const nodes = parseInline("a **b** c");
    expect(nodes).toEqual([
      { type: "text", text: "a " },
      { type: "text", text: "b", marks: [{ type: "strong" }] },
      { type: "text", text: " c" },
    ]);
  });

  it("parses links whose URL contains balanced parentheses", () => {
    expect(parseInline("[Foo](https://en.wikipedia.org/wiki/Foo_(disambiguation))")).toEqual([
      {
        type: "text",
        text: "Foo",
        marks: [{ type: "link", attrs: { href: "https://en.wikipedia.org/wiki/Foo_(disambiguation)" } }],
      },
    ]);
  });
});
