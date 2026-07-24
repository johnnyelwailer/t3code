import { beforeEach, describe, expect, it } from "vite-plus/test";
import { normalizeT3TeamDraftMutation } from "./t3team-draftMutationModel";
import { selectJiraDocumentDrafts, useT3TeamDraftMutationStore } from "./t3team-draftMutationStore";

describe("normalizeT3TeamDraftMutation", () => {
  it("normalizes server description draft results into document drafts", () => {
    const draft = normalizeT3TeamDraftMutation({
      projectId: "project-alpha",
      createdAt: "2026-06-27T10:00:00.000Z",
      raw: {
        kind: "jira-work-item-draft",
        tool: "t3team.work_item.description.draft_update",
        target: { provider: "jira", issueIdOrKey: "ALPHA-42" },
        field: "description",
        patch: { description: "## Updated\nShip the retry guard." },
        status: "draft",
      },
    });

    expect(draft).toMatchObject({
      projectId: "project-alpha",
      target: { issueIdOrKey: "ALPHA-42" },
      field: "description",
      status: "draft",
      proposedContent: { format: "markdown", body: "## Updated\nShip the retry guard." },
    });
  });
});

describe("useT3TeamDraftMutationStore", () => {
  beforeEach(() => {
    useT3TeamDraftMutationStore.setState({ drafts: [] });
  });

  it("upserts, selects, and discards Jira document drafts", () => {
    const draft = normalizeT3TeamDraftMutation({
      projectId: "project-alpha",
      createdAt: "2026-06-27T10:00:00.000Z",
      raw: {
        kind: "jira-work-item-draft",
        target: { provider: "jira", issueIdOrKey: "ALPHA-42" },
        field: "comment",
        patch: { body: "Ready for review." },
        status: "draft",
      },
    });
    expect(draft).not.toBeNull();

    useT3TeamDraftMutationStore.getState().upsertDrafts([draft!]);
    expect(
      selectJiraDocumentDrafts({
        projectId: "project-alpha",
        issueIdOrKey: "ALPHA-42",
      })(useT3TeamDraftMutationStore.getState()),
    ).toHaveLength(1);

    useT3TeamDraftMutationStore.getState().discardDraft(draft!.id);
    expect(
      selectJiraDocumentDrafts({
        projectId: "project-alpha",
        issueIdOrKey: "ALPHA-42",
      })(useT3TeamDraftMutationStore.getState()),
    ).toHaveLength(0);
  });
});
