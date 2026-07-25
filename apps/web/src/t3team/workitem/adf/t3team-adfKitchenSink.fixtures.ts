import type { AdfDocument, AdfNode } from "./t3team-adfRendererTypes";

function text(value: string, marks?: AdfNode["marks"]): AdfNode {
  return marks === undefined ? { type: "text", text: value } : { type: "text", text: value, marks };
}

function paragraph(...content: AdfNode[]): AdfNode {
  return { type: "paragraph", content };
}

function listItem(...content: AdfNode[]): AdfNode {
  return { type: "listItem", content };
}

function cell(type: "tableCell" | "tableHeader", value: string, attrs?: AdfNode["attrs"]): AdfNode {
  return { type, content: [paragraph(text(value))], ...(attrs === undefined ? {} : { attrs }) };
}

const MARKS_PARAGRAPH: AdfNode = paragraph(
  text("Plain, "),
  text("bold", [{ type: "strong" }]),
  text(", "),
  text("italic", [{ type: "em" }]),
  text(", "),
  text("bold italic link", [
    { type: "strong" },
    { type: "em" },
    { type: "link", attrs: { href: "https://example.com/spec", title: "Spec" } },
  ]),
  text(", "),
  text("underline", [{ type: "underline" }]),
  text(", "),
  text("struck", [{ type: "strike" }]),
  text(", "),
  text("inline code", [{ type: "code" }]),
  text(", H"),
  text("2", [{ type: "subsup", attrs: { type: "sub" } }]),
  text("O and x"),
  text("2", [{ type: "subsup", attrs: { type: "sup" } }]),
  text(", "),
  text("author coloured", [{ type: "textColor", attrs: { color: "#bf2600" } }]),
  text(", "),
  text("highlighted", [{ type: "backgroundColor", attrs: { color: "#fedec8" } }]),
  text("."),
);

const INLINE_NODES_PARAGRAPH: AdfNode = paragraph(
  text("Due "),
  { type: "date", attrs: { timestamp: "1719878400000" } },
  text(" · severity "),
  { type: "status", attrs: { text: "critical", color: "red" } },
  { type: "status", attrs: { text: "in progress", color: "yellow" } },
  { type: "status", attrs: { text: "done", color: "green" } },
  { type: "status", attrs: { text: "note", color: "purple" } },
  { type: "status", attrs: { text: "info", color: "blue" } },
  { type: "status", attrs: { text: "backlog", color: "neutral" } },
  text(" · owner "),
  { type: "mention", attrs: { id: "5b10a2844c20165700ede21g", text: "@Jane Doe" } },
  text(" · "),
  { type: "emoji", attrs: { shortName: ":white_check_mark:", text: "✅" } },
  text(" · "),
  { type: "inlineCard", attrs: { url: "https://example.atlassian.net/browse/T3T-42" } },
  text(" · first line"),
  { type: "hardBreak" },
  text("second line after a hard break"),
);

const TABLE_NODE: AdfNode = {
  type: "table",
  attrs: { isNumberColumnEnabled: true, layout: "center" },
  content: [
    {
      type: "tableRow",
      content: [
        cell("tableHeader", "Field"),
        cell("tableHeader", "Value"),
        cell("tableHeader", "Evidence"),
      ],
    },
    {
      type: "tableRow",
      content: [
        cell("tableCell", "Latency budget", { colwidth: [180] }),
        cell("tableCell", "120 ms", { background: "#deebff" }),
        {
          type: "tableCell",
          content: [
            {
              type: "nestedExpand",
              attrs: { title: "Trace detail" },
              content: [paragraph(text("p95 measured on 2026-07-01 across three regions."))],
            },
          ],
        },
      ],
    },
    {
      type: "tableRow",
      content: [
        cell("tableCell", "Rollout", { colspan: 2 }),
        cell("tableCell", "Staged, 10% → 100% over four days"),
      ],
    },
  ],
};

const PANEL_NODES: readonly AdfNode[] = (
  ["info", "note", "warning", "error", "success"] as const
).map((panelType) => ({
  type: "panel",
  attrs: { panelType },
  content: [paragraph(text(`${panelType} panel with `), text("emphasis", [{ type: "strong" }]))],
}));

/** One document exercising every node family the renderer supports, plus an unknown node. */
export const T3TEAM_ADF_KITCHEN_SINK_DOC: AdfDocument = {
  version: 1,
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Work item description")] },
    MARKS_PARAGRAPH,
    INLINE_NODES_PARAGRAPH,
    { type: "heading", attrs: { level: 2 }, content: [text("Context")] },
    {
      type: "blockquote",
      content: [paragraph(text("Quoted requirement from the original brief."))],
    },
    { type: "rule" },
    { type: "heading", attrs: { level: 3 }, content: [text("Acceptance criteria")] },
    {
      type: "taskList",
      attrs: { localId: "tl-1" },
      content: [
        {
          type: "taskItem",
          attrs: { localId: "ti-1", state: "DONE" },
          content: [text("ADF renders panels natively")],
        },
        {
          type: "taskItem",
          attrs: { localId: "ti-2", state: "TODO" },
          content: [text("Tables scroll inside their own container")],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        listItem(paragraph(text("Top level bullet"))),
        listItem(paragraph(text("Bullet with a nested list")), {
          type: "bulletList",
          content: [listItem(paragraph(text("Nested bullet")))],
        }),
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 3 },
      content: [
        listItem(paragraph(text("Starts at three"))),
        listItem(paragraph(text("Then four"))),
      ],
    },
    {
      type: "decisionList",
      attrs: { localId: "dl-1" },
      content: [
        {
          type: "decisionItem",
          attrs: { localId: "di-1", state: "DECIDED" },
          content: [text("Stay ADF-native; no markdown round trip")],
        },
      ],
    },
    ...PANEL_NODES,
    {
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: [text("const doc = { version: 1, type: 'doc' };\n  // indented line")],
    },
    TABLE_NODE,
    {
      type: "expand",
      attrs: { title: "Forensic detail" },
      content: [paragraph(text("Collapsed by default, expandable without JavaScript."))],
    },
    {
      type: "mediaSingle",
      attrs: { layout: "center" },
      content: [
        {
          type: "media",
          attrs: {
            id: "4478e39c-cd12-4f5b-9b0e-7ac2f7d7f0aa",
            type: "file",
            collection: "jira-attachments",
            width: 320,
            height: 180,
            alt: "diagram.png",
          },
        },
      ],
    },
    {
      type: "mediaGroup",
      content: [
        {
          type: "media",
          attrs: { id: "media-2", type: "file", collection: "jira", alt: "report.pdf" },
        },
      ],
    },
    { type: "blockCard", attrs: { url: "https://example.atlassian.net/browse/T3T-7" } },
    { type: "embedCard", attrs: { url: "https://example.com/dashboards/latency", layout: "wide" } },
    {
      type: "bodiedExtension",
      attrs: { extensionType: "com.example", extensionKey: "chart" },
      content: [paragraph(text("Extension body still renders its own content."))],
    },
  ],
};
