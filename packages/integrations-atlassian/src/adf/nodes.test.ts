import { describe, expect, it } from "vite-plus/test";
import {
  codeBlock,
  date,
  expand,
  inlineCard,
  mention,
  nestedExpand,
  panel,
  rule,
  status,
  taskItem,
  taskList,
} from "./nodes.ts";
import { paragraph, heading } from "./builders.ts";

describe("status", () => {
  it("builds a status lozenge with text/color", () => {
    expect(status("CRITICAL", "red")).toEqual({
      type: "status",
      attrs: { text: "CRITICAL", color: "red" },
    });
  });
});

describe("taskList/taskItem", () => {
  it("builds a task list with localId and TODO/DONE items", () => {
    const item = taskItem("ti-1", "TODO", [{ type: "text", text: "Add AC" }]);
    expect(item).toEqual({
      type: "taskItem",
      attrs: { localId: "ti-1", state: "TODO" },
      content: [{ type: "text", text: "Add AC" }],
    });
    const list = taskList("tl-1", [item]);
    expect(list).toEqual({ type: "taskList", attrs: { localId: "tl-1" }, content: [item] });
  });
});

describe("inlineCard", () => {
  it("builds an inline card from a url", () => {
    expect(inlineCard("https://example.atlassian.net/browse/IES-1")).toEqual({
      type: "inlineCard",
      attrs: { url: "https://example.atlassian.net/browse/IES-1" },
    });
  });
});

describe("date", () => {
  it("builds a date node with a string timestamp", () => {
    expect(date("1719878400000")).toEqual({ type: "date", attrs: { timestamp: "1719878400000" } });
  });
});

describe("mention", () => {
  it("builds a mention with accountId and optional text", () => {
    expect(mention("acc-1")).toEqual({ type: "mention", attrs: { id: "acc-1" } });
    expect(mention("acc-1", "@Jane")).toEqual({
      type: "mention",
      attrs: { id: "acc-1", text: "@Jane" },
    });
  });
});

describe("codeBlock", () => {
  it("builds a code block with optional language, dropping empty text", () => {
    expect(codeBlock("const x = 1;", "javascript")).toEqual({
      type: "codeBlock",
      attrs: { language: "javascript" },
      content: [{ type: "text", text: "const x = 1;" }],
    });
    expect(codeBlock("")).toEqual({ type: "codeBlock", content: [] });
  });
});

describe("rule", () => {
  it("builds a bare rule node", () => {
    expect(rule()).toEqual({ type: "rule" });
  });
});

describe("panel guards", () => {
  it("rejects codeBlock content", () => {
    expect(() => panel("info", [codeBlock("x")])).toThrow(TypeError);
  });
  it("rejects table content", () => {
    expect(() => panel("info", [{ type: "table", content: [] }])).toThrow(TypeError);
  });
  it("allows paragraph/heading/list content", () => {
    expect(() => panel("info", [paragraph("ok"), heading(3, "h")])).not.toThrow();
  });
});

describe("expand guards", () => {
  it("rejects nested expand", () => {
    expect(() => expand("outer", [expand("inner", [paragraph("x")])])).toThrow(TypeError);
  });
});

describe("nestedExpand guards", () => {
  it("allows paragraph/heading content", () => {
    expect(() => nestedExpand("Details", [paragraph("x")])).not.toThrow();
  });
  it("rejects non paragraph/heading/media content", () => {
    expect(() => nestedExpand("Details", [{ type: "table", content: [] }])).toThrow(TypeError);
  });
});
