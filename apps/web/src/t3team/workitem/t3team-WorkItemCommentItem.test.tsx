import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { WorkItemCommentItem, isWorkItemCommentEdited } from "./t3team-WorkItemCommentItem";

describe("isWorkItemCommentEdited", () => {
  it("is false when updated and created are the same instant", () => {
    const comment: JiraCommentItem = {
      created: "2026-06-01T00:00:00.000Z",
      updated: "2026-06-01T00:00:00.000Z",
    };
    expect(isWorkItemCommentEdited(comment)).toBe(false);
  });

  it("is false for clock noise from the create call itself", () => {
    const comment: JiraCommentItem = {
      created: "2026-06-01T00:00:00.000Z",
      updated: "2026-06-01T00:00:05.000Z",
    };
    expect(isWorkItemCommentEdited(comment)).toBe(false);
  });

  it("is true once updated meaningfully diverges from created", () => {
    const comment: JiraCommentItem = {
      created: "2026-06-01T00:00:00.000Z",
      updated: "2026-06-01T01:00:00.000Z",
    };
    expect(isWorkItemCommentEdited(comment)).toBe(true);
  });

  it("is false when either timestamp is missing or unparsable", () => {
    expect(isWorkItemCommentEdited({ updated: "2026-06-01T01:00:00.000Z" })).toBe(false);
    expect(isWorkItemCommentEdited({ created: "2026-06-01T00:00:00.000Z" })).toBe(false);
  });
});

function render(props: Parameters<typeof WorkItemCommentItem>[0]): string {
  return renderToStaticMarkup(<WorkItemCommentItem {...props} />);
}

describe("WorkItemCommentItem", () => {
  it("shows an edited marker only when the comment earns one", () => {
    const edited = render({
      comment: {
        author: "Ada",
        created: "2026-06-01T00:00:00.000Z",
        updated: "2026-06-02T00:00:00.000Z",
        bodyMarkdown: "hello",
      },
      nowMs: Date.now(),
    });
    const notEdited = render({
      comment: { author: "Ada", created: "2026-06-01T00:00:00.000Z", bodyMarkdown: "hello" },
      nowMs: Date.now(),
    });

    expect(edited).toContain("(edited)");
    expect(notEdited).not.toContain("(edited)");
  });

  it("gets a warning accent border when internal, not when public", () => {
    const internal = render({
      comment: { author: "Ada", bodyMarkdown: "hello", isInternal: true },
      nowMs: Date.now(),
    });
    const publicComment = render({
      comment: { author: "Ada", bodyMarkdown: "hello" },
      nowMs: Date.now(),
    });

    expect(internal).toContain("border-warning/60");
    expect(publicComment).not.toContain("border-warning/60");
  });

  it("lets a caller override body rendering via renderBody", () => {
    const markup = render({
      comment: { author: "Ada", bodyMarkdown: "raw markdown" },
      nowMs: Date.now(),
      renderBody: () => <div data-testid="adf-body">rendered from ADF</div>,
    });

    expect(markup).toContain("rendered from ADF");
    expect(markup).not.toContain("raw markdown");
  });
});

describe("WorkItemCommentItem body rendering", () => {
  const NOW_MS = Date.UTC(2026, 5, 1, 12, 0);

  it("uses renderBody when it returns content", () => {
    const html = render({
      comment: { author: "Ada", created: "2026-06-01T11:00:00.000Z", bodyMarkdown: "fallback" },
      nowMs: NOW_MS,
      renderBody: () => <p>from renderBody</p>,
    });
    expect(html).toContain("from renderBody");
    expect(html).not.toContain("fallback");
  });

  /**
   * Comments arrive mixed: some carry ADF, older cached ones only markdown. A renderer that only
   * handles ADF returns nothing for the rest, and that must fall through rather than blank the body.
   */
  it("falls back to markdown when renderBody returns nothing", () => {
    const html = render({
      comment: {
        author: "Ada",
        created: "2026-06-01T11:00:00.000Z",
        bodyMarkdown: "markdown body survives",
      },
      nowMs: NOW_MS,
      renderBody: () => null,
    });
    expect(html).toContain("markdown body survives");
  });

  it("falls back to html when renderBody returns nothing", () => {
    const html = render({
      comment: {
        author: "Ada",
        created: "2026-06-01T11:00:00.000Z",
        bodyHtml: "<p>html body survives</p>",
      },
      nowMs: NOW_MS,
      renderBody: () => null,
    });
    expect(html).toContain("html body survives");
  });
});
