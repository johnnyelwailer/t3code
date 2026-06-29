import { beforeEach, describe, expect, it } from "vite-plus/test";
import { normalizeT3WorkDraftMutation } from "./t3work-draftMutationModel";
import { selectJiraDocumentDrafts, useT3WorkDraftMutationStore } from "./t3work-draftMutationStore";

describe("normalizeT3WorkDraftMutation", () => {
  it("normalizes server description draft results into document drafts", () => {
    const draft = normalizeT3WorkDraftMutation({
      projectId: "project-alpha",
      createdAt: "2026-06-27T10:00:00.000Z",
      raw: {
        kind: "jira-work-item-draft",
        tool: "t3work.work_item.description.draft_update",
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

describe("useT3WorkDraftMutationStore", () => {
  beforeEach(() => {
    useT3WorkDraftMutationStore.setState({ drafts: [] });
  });

  it("upserts, selects, and discards Jira document drafts", () => {
    const draft = normalizeT3WorkDraftMutation({
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

    useT3WorkDraftMutationStore.getState().upsertDrafts([draft!]);
    expect(
      selectJiraDocumentDrafts({
        projectId: "project-alpha",
        issueIdOrKey: "ALPHA-42",
      })(useT3WorkDraftMutationStore.getState()),
    ).toHaveLength(1);

    useT3WorkDraftMutationStore.getState().discardDraft(draft!.id);
    expect(
      selectJiraDocumentDrafts({
        projectId: "project-alpha",
        issueIdOrKey: "ALPHA-42",
      })(useT3WorkDraftMutationStore.getState()),
    ).toHaveLength(0);
  });
});
