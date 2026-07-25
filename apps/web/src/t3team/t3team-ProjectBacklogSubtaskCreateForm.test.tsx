import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  ProjectBacklogSubtaskCreateForm,
  type ProjectBacklogSubtaskCreateDraft,
} from "./t3team-ProjectBacklogSubtaskCreateForm";

describe("ProjectBacklogSubtaskCreateForm", () => {
  it("renders a minimal inline title and optional hours form", () => {
    const draft: ProjectBacklogSubtaskCreateDraft = {
      summary: "Draft rollout checklist",
      estimateHours: "2.5",
    };

    const markup = renderToStaticMarkup(
      <ProjectBacklogSubtaskCreateForm
        ticket={{
          id: "10009",
          projectId: "project-1",
          description: "Capture release coordination details before kickoff.",
          ref: {
            provider: "atlassian",
            kind: "issue",
            id: "10009",
            displayId: "PROJ-9",
            title: "Prepare release checklist",
            type: "Story",
            url: "https://example.com/browse/PROJ-9",
            projectId: "10000",
          },
          issueType: "Story",
          status: "In Progress",
          assignee: "Alex",
          estimateValue: 5,
          subtaskCount: 3,
          updatedAt: "2026-05-21T10:00:00.000Z",
        }}
        draft={draft}
        saving={false}
        onDraftChange={() => {}}
      />,
    );

    expect(markup).toContain("PROJ-9");
    expect(markup).toContain("New subtask under PROJ-9");
    expect(markup).toContain("Under PROJ-9");
    expect(markup).toContain("3 existing subtasks");
    expect(markup).toContain('value="Draft rollout checklist"');
    expect(markup).toContain('value="2.5"');
    expect(markup).not.toContain("Description");
  });
});
