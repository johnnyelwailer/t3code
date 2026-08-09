import { describe, expect, it } from "vite-plus/test";
import {
  selectJiraDocumentDrafts,
  selectWorkItemDrafts,
  useT3TeamDraftMutationStore,
} from "./t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "./t3team-draftMutationTypes";

function statusDraft(id: string): T3TeamDraftMutation {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    target: { provider: "jira", issueIdOrKey: "ALPHA-1" },
    field: "status",
    status: "draft",
    patch: { targetStatus: "Done" },
  };
}

describe("returnDraftWithFeedback", () => {
  it("sets status to returned and records the feedback", () => {
    useT3TeamDraftMutationStore.setState({ drafts: [statusDraft("d1")] });
    useT3TeamDraftMutationStore.getState().returnDraftWithFeedback("d1", "Wrong status — use In Review.");

    const draft = useT3TeamDraftMutationStore.getState().drafts[0];
    expect(draft?.status).toBe("returned");
    expect(draft?.feedback).toBe("Wrong status — use In Review.");
  });

  it("clears any stale error when a draft is returned", () => {
    useT3TeamDraftMutationStore.setState({
      drafts: [{ ...statusDraft("d1"), status: "error", error: "boom" }],
    });
    useT3TeamDraftMutationStore.getState().returnDraftWithFeedback("d1", "try again");

    const draft = useT3TeamDraftMutationStore.getState().drafts[0];
    expect(draft?.error).toBeUndefined();
  });
});

describe("pending-draft selectors", () => {
  it("exclude a returned draft the same way they exclude discarded/applied", () => {
    useT3TeamDraftMutationStore.setState({ drafts: [{ ...statusDraft("d1"), status: "returned" }] });
    expect(selectWorkItemDrafts({ issueIdOrKey: "ALPHA-1" })(useT3TeamDraftMutationStore.getState())).toEqual(
      [],
    );
  });

  it("still exclude returned document drafts too", () => {
    const returnedComment: T3TeamDraftMutation = {
      id: "c1",
      createdAt: "2026-01-01T00:00:00.000Z",
      target: { provider: "jira", issueIdOrKey: "ALPHA-1" },
      field: "comment",
      status: "returned",
      proposedContent: { format: "plain", body: "x" },
    };
    useT3TeamDraftMutationStore.setState({ drafts: [returnedComment] });
    expect(
      selectJiraDocumentDrafts({ issueIdOrKey: "ALPHA-1" })(useT3TeamDraftMutationStore.getState()),
    ).toEqual([]);
  });
});
