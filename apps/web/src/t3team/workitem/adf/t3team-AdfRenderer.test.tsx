import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamAdfRenderer } from "./t3team-AdfRenderer";
import { T3TEAM_ADF_KITCHEN_SINK_DOC } from "./t3team-adfKitchenSink.fixtures";
import { listAdfRenderedNodeTypes } from "./t3team-adfNodeRegistry";
import type { AdfDocument, AdfNode } from "./t3team-adfRendererTypes";

function render(props: Parameters<typeof T3TeamAdfRenderer>[0]): string {
  return renderToStaticMarkup(<T3TeamAdfRenderer {...props} />);
}

function doc(...content: AdfNode[]): AdfDocument {
  return { version: 1, type: "doc", content };
}

const KITCHEN_SINK_MARKUP = render({
  doc: T3TEAM_ADF_KITCHEN_SINK_DOC,
  resolveAssetUrl: (url) => (url === "diagram.png" ? "/local/diagram.png" : url),
});

describe("T3TeamAdfRenderer node coverage", () => {
  it("renders every block family from the kitchen sink document", () => {
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-root="true"');
    expect(KITCHEN_SINK_MARKUP).toContain("<h1");
    expect(KITCHEN_SINK_MARKUP).toContain("<h2");
    expect(KITCHEN_SINK_MARKUP).toContain("<h3");
    expect(KITCHEN_SINK_MARKUP).toContain("<blockquote");
    expect(KITCHEN_SINK_MARKUP).toContain("<hr");
    expect(KITCHEN_SINK_MARKUP).toContain("<pre");
    // Code indentation survives verbatim rather than being whitespace-normalised.
    expect(KITCHEN_SINK_MARKUP).toContain("\n  // indented line");
    expect(KITCHEN_SINK_MARKUP).toContain("<ul");
    expect(KITCHEN_SINK_MARKUP).toContain("<ol");
    expect(KITCHEN_SINK_MARKUP).toContain('start="3"');
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-node="taskList"');
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-state="DONE"');
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-node="decisionItem"');
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-node="expand"');
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-node="nestedExpand"');
    expect(KITCHEN_SINK_MARKUP).toContain("<details");
    expect(KITCHEN_SINK_MARKUP).toContain("<summary");
  });

  it("renders every inline family, including status, mention, date, emoji and smart links", () => {
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-node="status"');
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-node="mention"');
    expect(KITCHEN_SINK_MARKUP).toContain("@Jane Doe");
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-node="date"');
    expect(KITCHEN_SINK_MARKUP).toContain("2024");
    expect(KITCHEN_SINK_MARKUP).toContain('role="img"');
    expect(KITCHEN_SINK_MARKUP).toContain("<br");
    expect(KITCHEN_SINK_MARKUP).toContain("T3T-42");
    expect(KITCHEN_SINK_MARKUP).toContain("T3T-7");
    expect(KITCHEN_SINK_MARKUP).toContain("example.com/dashboards/latency");
  });

  it("renders all five panel types onto semantic tones", () => {
    for (const tone of ["info", "primary", "warning", "danger", "success"]) {
      expect(KITCHEN_SINK_MARKUP).toContain(`data-adf-panel-tone="${tone}"`);
    }
  });

  it("keeps unknown node types alive by rendering their content", () => {
    expect(KITCHEN_SINK_MARKUP).toContain("Extension body still renders its own content.");
    expect(KITCHEN_SINK_MARKUP).not.toContain("bodiedExtension");
  });

  it("has a dispatch entry for every node type in the ADF schema", () => {
    // Atlassian's documented node catalog (extension/syncBlock families are intentionally
    // left to the unknown-node fallback, which renders their body content).
    const documentedNodeTypes = [
      "blockCard",
      "blockquote",
      "bulletList",
      "codeBlock",
      "date",
      "decisionItem",
      "decisionList",
      "embedCard",
      "emoji",
      "expand",
      "hardBreak",
      "heading",
      "inlineCard",
      "listItem",
      "media",
      "mediaGroup",
      "mediaInline",
      "mediaSingle",
      "mention",
      "nestedExpand",
      "orderedList",
      "panel",
      "paragraph",
      "rule",
      "status",
      "table",
      "tableCell",
      "tableHeader",
      "tableRow",
      "taskItem",
      "taskList",
      "text",
    ];
    const registered = new Set(listAdfRenderedNodeTypes());
    expect(documentedNodeTypes.filter((type) => !registered.has(type))).toEqual([]);
  });
});

describe("T3TeamAdfRenderer marks", () => {
  it("composes bold, italic and link on one text node", () => {
    const markup = render({
      doc: doc({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "combined",
            marks: [
              { type: "strong" },
              { type: "em" },
              { type: "link", attrs: { href: "https://example.com/x" } },
            ],
          },
        ],
      }),
    });
    expect(markup).toContain('href="https://example.com/x"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toMatch(/<strong[^>]*><em[^>]*>combined<\/em><\/strong>/);
  });

  it("applies a validated author text colour inline and never an author background colour", () => {
    const markup = render({
      doc: doc({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "tinted",
            marks: [{ type: "textColor", attrs: { color: "#bf2600" } }],
          },
          {
            type: "text",
            text: "lit",
            marks: [{ type: "backgroundColor", attrs: { color: "#fedec8" } }],
          },
          { type: "text", text: "bogus", marks: [{ type: "textColor", attrs: { color: "red" } }] },
        ],
      }),
    });
    expect(markup).toMatch(/style="color:\s*#bf2600"/);
    expect(markup).toContain("bg-foreground/10");
    expect(markup).not.toContain("#fedec8");
    expect(markup).not.toContain("color:red");
  });

  it("renders unsafe link targets as plain text", () => {
    const markup = render({
      doc: doc({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "click me",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      }),
    });
    expect(markup).toContain("click me");
    expect(markup).not.toContain("<a");
    expect(markup).not.toContain("javascript:");
  });
});

describe("T3TeamAdfRenderer tables", () => {
  it("wraps tables in their own horizontal scroll container", () => {
    expect(KITCHEN_SINK_MARKUP).toContain('data-adf-table-scroll="true"');
    expect(KITCHEN_SINK_MARKUP).toContain("overflow-x-auto");
    expect(KITCHEN_SINK_MARKUP).toContain("<th");
    expect(KITCHEN_SINK_MARKUP).toMatch(/colspan="2"/i);
    // Number column enabled -> body rows are numbered, the header row is not.
    expect(KITCHEN_SINK_MARKUP).toContain("tabular-nums");
  });

  it("drops tables with no rows instead of emitting an empty shell", () => {
    const markup = render({ doc: doc({ type: "table", content: [] }) });
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("data-adf-table-scroll");
  });
});

describe("T3TeamAdfRenderer links and issues", () => {
  it("routes Jira issue targets through onOpenIssue when provided", () => {
    const inlineCard = doc({
      type: "paragraph",
      content: [{ type: "inlineCard", attrs: { url: "https://site.atlassian.net/browse/OPS-12" } }],
    });
    const withHandler = render({ doc: inlineCard, onOpenIssue: () => {} });
    expect(withHandler).toContain('data-adf-issue-key="OPS-12"');
    expect(withHandler).toContain("<button");

    const withoutHandler = render({ doc: inlineCard });
    expect(withoutHandler).toContain("<a");
    expect(withoutHandler).toContain('rel="noreferrer"');
    expect(withoutHandler).not.toContain("<button");
  });
});

describe("T3TeamAdfRenderer media", () => {
  it("resolves media through the host asset resolver", () => {
    expect(KITCHEN_SINK_MARKUP).toContain('src="/local/diagram.png"');
    expect(KITCHEN_SINK_MARKUP).toContain('alt="diagram.png"');
  });

  it("trusts host-resolved media URLs but never a document-supplied unsafe one", () => {
    const resolved = render({
      doc: doc({
        type: "mediaSingle",
        attrs: { layout: "center" },
        content: [{ type: "media", attrs: { id: "m1", alt: "chart.png", width: 10, height: 10 } }],
      }),
      resolveAssetUrl: () => "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
    });
    expect(resolved).toContain('src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E"');

    const hostile = render({
      doc: doc({ type: "media", attrs: { url: "javascript:alert(1)", alt: "x.png" } }),
    });
    expect(hostile).not.toContain("javascript:");
    expect(hostile).toContain("x.png");
  });

  it("falls back to the filename when nothing resolves", () => {
    const markup = render({
      doc: doc({
        type: "mediaGroup",
        content: [{ type: "media", attrs: { id: "x", type: "file", alt: "report.pdf" } }],
      }),
    });
    expect(markup).toContain("report.pdf");
    expect(markup).not.toContain("<img");
  });
});

describe("T3TeamAdfRenderer resilience", () => {
  it("renders nothing for empty, absent or malformed documents", () => {
    expect(render({ doc: null })).toBe("");
    expect(render({ doc: undefined })).toBe("");
    expect(render({ doc: { version: 1, type: "doc" } })).toBe("");
    expect(render({ doc: doc() })).toBe("");
    expect(render({ doc: {} as AdfDocument })).toBe("");
    expect(render({ doc: "not a doc" as unknown as AdfDocument })).toBe("");
  });

  it("skips non-node children instead of throwing", () => {
    const malformed = {
      version: 1,
      type: "doc",
      content: [null, 7, "text", { type: "paragraph", content: [{ type: "text", text: "ok" }] }],
    } as unknown as AdfDocument;
    expect(render({ doc: malformed })).toContain("ok");
  });

  it("flattens pathologically deep documents instead of blowing the stack", () => {
    let node: AdfNode = { type: "paragraph", content: [{ type: "text", text: "bottom" }] };
    for (let index = 0; index < 200; index += 1) {
      node = { type: "blockquote", content: [node] };
    }
    const markup = render({ doc: doc(node) });
    expect(markup).toContain("data-adf-flattened");
    expect(markup).toContain("bottom");
  });
});
