import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ChildIssueCreateForm } from "./t3team-ChildIssueCreateForm";
import { EMPTY_CHILD_ISSUE_CREATE_DRAFT, type ChildIssueCreateDraft } from "./t3team-childIssueCreateTypes";

describe("ChildIssueCreateForm", () => {
  it("renders issue type, summary, assignee, estimate and description fields", () => {
    const draft: ChildIssueCreateDraft = {
      ...EMPTY_CHILD_ISSUE_CREATE_DRAFT,
      summary: "Draft rollout checklist",
      estimateHours: "2.5",
      assignee: { accountId: "acc-1", displayName: "Ada Lovelace" },
    };

    const markup = renderToStaticMarkup(
      <ChildIssueCreateForm
        parentDisplayId="PROJ-9"
        draft={draft}
        saving={false}
        error={null}
        onDraftChange={() => {}}
        searchAssignableUsers={async () => []}
      />,
    );

    expect(markup).toContain("New child issue under PROJ-9");
    expect(markup).toContain('value="Draft rollout checklist"');
    expect(markup).toContain('value="2.5"');
    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("Add a description");
    /*
      No `onListChildIssueTypes` supplied, so Jira has named no type. This used to assert the field
      said "Subtask" — a word the code invented, which is exactly how a project whose types could not
      be read came to look identical to one with a subtask type, right up until Create failed.
    */
    expect(markup).toContain("No child type");
    expect(markup).not.toContain(">Subtask<");
  });

  it("shows a validation error inline", () => {
    const markup = renderToStaticMarkup(
      <ChildIssueCreateForm
        parentDisplayId="PROJ-9"
        draft={EMPTY_CHILD_ISSUE_CREATE_DRAFT}
        saving={false}
        error="Child issue title is required."
        onDraftChange={() => {}}
        searchAssignableUsers={async () => []}
      />,
    );

    expect(markup).toContain("Child issue title is required.");
  });

  it("shows the real picker once more than one child issue type is reachable", async () => {
    const markup = renderToStaticMarkup(
      <ChildIssueCreateForm
        parentDisplayId="PROJ-9"
        draft={EMPTY_CHILD_ISSUE_CREATE_DRAFT}
        saving={false}
        error={null}
        onDraftChange={() => {}}
        searchAssignableUsers={async () => []}
        listChildIssueTypes={async () => [
          { id: "1", name: "Subtask" },
          { id: "2", name: "Bug" },
        ]}
      />,
    );

    // Only one server round trip resolves before this static render — the field still renders its
    // "reachable but loading" state rather than crashing when options haven't arrived yet.
    expect(markup).toContain("Loading");
  });
});
