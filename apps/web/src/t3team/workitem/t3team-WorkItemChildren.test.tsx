import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemChildren, countWorkItemChildrenDone } from "./t3team-WorkItemChildren";

function ticket(id: string, status: string): ProjectTicket {
  return {
    id,
    projectId: "project-1",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id,
      displayId: id,
      title: `Ticket ${id}`,
      url: `https://example.test/browse/${id}`,
      projectId: "EXT-1",
      type: "Task",
    },
    issueType: "Task",
    status,
    updatedAt: "2026-06-30T00:00:00.000Z",
  };
}

describe("countWorkItemChildrenDone", () => {
  it("counts none done", () => {
    const children = [ticket("1", "To Do"), ticket("2", "In Progress")];
    expect(countWorkItemChildrenDone(children)).toEqual({ done: 0, total: 2 });
  });

  it("counts all done", () => {
    const children = [ticket("1", "Done"), ticket("2", "Closed")];
    expect(countWorkItemChildrenDone(children)).toEqual({ done: 2, total: 2 });
  });

  it("counts a mix by status category", () => {
    const children = [ticket("1", "Done"), ticket("2", "In Progress"), ticket("3", "To Do")];
    expect(countWorkItemChildrenDone(children)).toEqual({ done: 1, total: 3 });
  });

  it("handles an empty list", () => {
    expect(countWorkItemChildrenDone([])).toEqual({ done: 0, total: 0 });
  });
});

describe("WorkItemChildren", () => {
  it("renders nothing with no children", () => {
    expect(renderToStaticMarkup(<WorkItemChildren items={[]} />)).toBe("");
  });

  it("shows the 'N of M done' progress affordance", () => {
    const markup = renderToStaticMarkup(
      <WorkItemChildren items={[ticket("1", "Done"), ticket("2", "To Do")]} />,
    );
    expect(markup).toContain("1 of 2 done");
  });

  it("shows an 'Add child' action once a backend is connected, even with no children yet", () => {
    const markup = renderToStaticMarkup(
      <WorkItemChildren
        items={[]}
        backend={{} as never}
        accountId="acc-1"
        externalProjectId="EXT-1"
        issueIdOrKey="T3T-1"
        onReload={() => {}}
      />,
    );
    expect(markup).toContain("Add child");
  });
});
