import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { UnsupportedOperationError } from "~/t3team/changeset/t3team-changeSetApply";
import { createChangeSetAcceptOp } from "~/t3team/changeset/t3team-changeSetAcceptOp";

const draft = (field: string, patch: Record<string, unknown>) =>
  ({
    id: "jira-draft:x",
    kind: "jira-work-item-draft",
    tool: "t",
    target: { provider: "jira", issueIdOrKey: "NXAI-7" },
    field,
    patch,
    status: "draft",
    commitPolicy: { requiresUserApproval: true, commitSurface: "t3team-ui" },
  }) as unknown as T3TeamDraftMutationPayload;

function setup() {
  const backend = {
    updateIssueStatus: vi.fn(async () => ({ status: "Done" })),
    updateIssueAssignee: vi.fn(async () => {}),
    updateIssueEstimate: vi.fn(async () => ({ label: "" })),
    updateIssueDescription: vi.fn(async () => {}),
    addIssueComment: vi.fn(async () => ({ id: "c" })),
    createIssueLink: vi.fn(async () => {}),
    deleteIssueLink: vi.fn(async () => {}),
    createSubtask: vi.fn(async () => ({ id: "1", key: "NXAI-8" })),
  };
  const accept = createChangeSetAcceptOp({
    backend: backend as unknown as AtlassianBackendApi,
    accountId: "acct",
    projectId: "proj",
  });
  return { backend, accept };
}

describe("createChangeSetAcceptOp", () => {
  it.each([
    ["status", { targetStatus: "Done" }, "updateIssueStatus", { targetStatus: "Done" }],
    [
      "assignee",
      { assigneeAccountId: "u1", assigneeDisplayName: "Ada" },
      "updateIssueAssignee",
      { assigneeAccountId: "u1" },
    ],
    [
      "estimate",
      { estimateMode: "points", estimateValue: 5 },
      "updateIssueEstimate",
      { estimateValue: 5, estimateMode: "points" },
    ],
    [
      "description",
      { description: "New body" },
      "updateIssueDescription",
      { description: "New body" },
    ],
    ["comment", { body: "Hello" }, "addIssueComment", { body: "Hello" }],
    [
      "link",
      { otherIssueIdOrKey: "NXAI-9", linkTypeName: "Blocks", direction: "outward" },
      "createIssueLink",
      { otherIssueIdOrKey: "NXAI-9" },
    ],
    [
      "subtask",
      { summary: "Write tests", estimateHours: 2 },
      "createSubtask",
      { summary: "Write tests", projectId: "proj", parentIssueIdOrKey: "NXAI-7" },
    ],
  ] as const)(
    "writes a %s draft through the shared field write",
    async (field, patch, method, expected) => {
      const { backend, accept } = setup();
      await accept(draft(field, patch));
      expect(backend[method]).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acct", ...expected }),
      );
    },
  );

  it("will not write an hour-tracked estimate: the item view has no accept for it either", async () => {
    const { backend, accept } = setup();
    await expect(
      accept(draft("estimate", { estimateMode: "hours", estimateValue: 8 })),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
    expect(backend.updateIssueEstimate).not.toHaveBeenCalled();
  });

  it("will not guess at a patch no reader understands", async () => {
    const { backend, accept } = setup();
    await expect(accept(draft("status", {}))).rejects.toBeInstanceOf(UnsupportedOperationError);
    expect(backend.updateIssueStatus).not.toHaveBeenCalled();
  });
});
