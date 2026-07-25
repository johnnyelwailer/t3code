import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import {
  WorkItemComments,
  selectVisibleWorkItemComments,
  sortWorkItemCommentsNewestFirst,
} from "./t3team-WorkItemComments";

function comment(id: string, createdIsoOffset: number): JiraCommentItem {
  return {
    id,
    author: `Author ${id}`,
    created: new Date(Date.UTC(2026, 6, 1, 0, 0, createdIsoOffset)).toISOString(),
    bodyMarkdown: `comment ${id}`,
  };
}

describe("sortWorkItemCommentsNewestFirst", () => {
  it("orders comments by timestamp descending", () => {
    const sorted = sortWorkItemCommentsNewestFirst([
      comment("a", 0),
      comment("b", 10),
      comment("c", 5),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });
});

describe("selectVisibleWorkItemComments", () => {
  const eight = Array.from({ length: 8 }, (_, index) => comment(String(index), index));

  it("shows everything when the thread is at or under the initial cap", () => {
    const five = eight.slice(0, 5);
    expect(selectVisibleWorkItemComments(five, false)).toEqual({ visible: five, hiddenCount: 0 });
  });

  it("caps at 5 with the remainder hidden until expanded", () => {
    const { visible, hiddenCount } = selectVisibleWorkItemComments(eight, false);
    expect(visible).toHaveLength(5);
    expect(hiddenCount).toBe(3);
  });

  it("reveals everything once expanded", () => {
    const { visible, hiddenCount } = selectVisibleWorkItemComments(eight, true);
    expect(visible).toHaveLength(8);
    expect(hiddenCount).toBe(0);
  });
});

describe("WorkItemComments", () => {
  it("renders nothing for an empty thread", () => {
    expect(renderToStaticMarkup(<WorkItemComments comments={[]} nowMs={Date.now()} />)).toBe("");
  });

  it("never renders the retired '(newest first)' heading slop", () => {
    const markup = renderToStaticMarkup(
      <WorkItemComments comments={[comment("a", 0)]} nowMs={Date.now()} />,
    );
    expect(markup).not.toContain("newest first");
  });

  it("shows a 'Show N earlier' toggle only past the initial cap", () => {
    const eight = Array.from({ length: 8 }, (_, index) => comment(String(index), index));
    const short = renderToStaticMarkup(
      <WorkItemComments comments={eight.slice(0, 3)} nowMs={Date.now()} />,
    );
    const long = renderToStaticMarkup(<WorkItemComments comments={eight} nowMs={Date.now()} />);

    expect(short).not.toContain("Show");
    expect(long).toContain("Show 3 earlier");
  });
});
