import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationMessage } from "@t3tools/contracts";

import { collectT3TeamDraftMutations } from "./t3team-useDraftMutationIngest";

type IngestMessage = Pick<OrchestrationMessage, "t3teamExt" | "createdAt">;

function draftMessage(input: {
  readonly id: string;
  readonly field?: "assignee" | "description";
  readonly createdAt?: string;
}): IngestMessage {
  const field = input.field ?? "assignee";
  return {
    createdAt: input.createdAt ?? "2026-07-26T10:00:00.000Z",
    t3teamExt: {
      visibleToUser: false,
      visibleToAgent: false,
      attachments: [
        {
          kind: "draft-mutation",
          draft: {
            id: input.id,
            kind: "jira-work-item-draft",
            tool: "t3team.work_item.assignee.draft_update",
            target: { provider: "jira", issueIdOrKey: "PROJ-42" },
            field,
            patch:
              field === "description"
                ? { description: "New description body." }
                : { assigneeAccountId: "abc-123" },
            status: "draft",
            summary: "Drafted assigning PROJ-42.",
            commitPolicy: { requiresUserApproval: true, commitSurface: "t3team-ui" },
          },
        },
      ],
    },
  };
}

describe("collectT3TeamDraftMutations", () => {
  it("turns a draft attachment into a store draft stamped with the reading thread", () => {
    const collected = collectT3TeamDraftMutations({
      messages: [draftMessage({ id: "jira-draft:m1" })],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(),
    });

    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({
      id: "jira-draft:m1",
      sourceThreadId: "thread-1",
      createdAt: "2026-07-26T10:00:00.000Z",
      field: "assignee",
      status: "draft",
      summary: "Drafted assigning PROJ-42.",
      target: { provider: "jira", issueIdOrKey: "PROJ-42" },
    });
    // No projectId is stamped — the filter must stay permissive, see the module doc.
    expect(collected[0]).not.toHaveProperty("projectId");
  });

  it("maps a document draft's patch onto proposedContent", () => {
    const [draft] = collectT3TeamDraftMutations({
      messages: [draftMessage({ id: "jira-draft:m2", field: "description" })],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(),
    });

    expect(draft).toMatchObject({
      field: "description",
      proposedContent: { format: "markdown", body: "New description body." },
    });
  });

  it("skips drafts the store already holds, so a reviewed draft is never resurrected", () => {
    const collected = collectT3TeamDraftMutations({
      messages: [draftMessage({ id: "jira-draft:m1" }), draftMessage({ id: "jira-draft:m3" })],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(["jira-draft:m1"]),
    });

    expect(collected.map((draft) => draft.id)).toEqual(["jira-draft:m3"]);
  });

  it("ignores messages with no draft attachment", () => {
    const collected = collectT3TeamDraftMutations({
      messages: [
        { createdAt: "2026-07-26T10:00:00.000Z" },
        {
          createdAt: "2026-07-26T10:01:00.000Z",
          t3teamExt: { attachments: [{ kind: "view", miniappId: "something", props: {} }] },
        },
      ],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(),
    });

    expect(collected).toEqual([]);
  });
});
