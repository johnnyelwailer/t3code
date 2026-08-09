import { describe, expect, it } from "vite-plus/test";
import { text } from "./marks.ts";

describe("text with marks", () => {
  it("builds plain text with no marks key when no marks given", () => {
    expect(text("hi")).toEqual({ type: "text", text: "hi" });
  });

  it("builds strong/em/strike/underline marks", () => {
    expect(text("hi", { strong: true })).toEqual({ type: "text", text: "hi", marks: [{ type: "strong" }] });
    expect(text("hi", { em: true })).toEqual({ type: "text", text: "hi", marks: [{ type: "em" }] });
    expect(text("hi", { strike: true })).toEqual({ type: "text", text: "hi", marks: [{ type: "strike" }] });
    expect(text("hi", { underline: true })).toEqual({
      type: "text",
      text: "hi",
      marks: [{ type: "underline" }],
    });
  });

  it("builds subsup mark", () => {
    expect(text("2", { subsup: "sup" })).toEqual({
      type: "text",
      text: "2",
      marks: [{ type: "subsup", attrs: { type: "sup" } }],
    });
  });

  it("allows code combined only with link", () => {
    expect(text("x", { code: true, link: "https://x.example" })).toEqual({
      type: "text",
      text: "x",
      marks: [{ type: "code" }, { type: "link", attrs: { href: "https://x.example" } }],
    });
  });

  it("rejects textColor combined with code", () => {
    expect(() => text("x", { code: true, textColor: "#ff0000" })).toThrow(TypeError);
  });

  it("rejects textColor combined with link", () => {
    expect(() => text("x", { link: "https://x.example", textColor: "#ff0000" })).toThrow(TypeError);
  });

  it("rejects backgroundColor combined with code", () => {
    expect(() => text("x", { code: true, backgroundColor: "#ff0000" })).toThrow(TypeError);
  });

  it("validates 6-digit hex for textColor/backgroundColor", () => {
    expect(() => text("x", { textColor: "#fff" })).toThrow(TypeError);
    expect(() => text("x", { backgroundColor: "red" })).toThrow(TypeError);
    expect(text("x", { textColor: "#ff00ff" }).marks).toEqual([{ type: "textColor", attrs: { color: "#ff00ff" } }]);
  });

  it("rejects empty text", () => {
    expect(() => text("")).toThrow(TypeError);
  });
});
