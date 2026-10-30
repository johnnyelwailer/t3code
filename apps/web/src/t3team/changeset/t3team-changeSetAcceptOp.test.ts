import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  RefusedOperationError,
  UnsupportedOperationError,
} from "~/t3team/changeset/t3team-changeSetApply";
import { createChangeSetAcceptOp } from "~/t3team/changeset/t3team-changeSetAcceptOp";

const draft = (
  field: string,
  patch: Record<string, unknown>,
  target: Record<string, unknown> = { provider: "jira", issueIdOrKey: "NXAI-7" },
) =>
  ({
    id: "jira-draft:x",
    kind: "jira-work-item-draft",
    tool: "t",
    target,
    field,
    patch,
    status: "draft",
    commitPolicy: { requiresUserApproval: true, commitSurface: "t3team-ui" },
  }) as unknown as T3TeamDraftMutationPayload;

function setup(extra: { externalProjectId?: string; projectKey?: string | undefined } = {}) {
  const backend = {
    updateIssueStatus: vi.fn(async () => ({ status: "Done" })),
    updateIssueAssignee: vi.fn(async () => {}),
    updateIssueEstimate: vi.fn(async () => ({ label: "" })),
    updateIssueDescription: vi.fn(async () => {}),
    addIssueComment: vi.fn(async () => ({ id: "c" })),
    createIssueLink: vi.fn(async () => {}),
    deleteIssueLink: vi.fn(async () => {}),
    updateIssueFields: vi.fn(async () => {}),
    createSubtask: vi.fn(async () => ({ id: "1", key: "NXAI-8" })),
  };
  const accept = createChangeSetAcceptOp({
    backend: backend as unknown as AtlassianBackendApi,
    accountId: "acct",
    externalProjectId: "10042",
    projectKey: "NXAI",
    ...extra,
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
    ["comment", { body: "Hello" }, "addIssueComment", { body: "Hello" }],
    [
      "link",
      { otherIssueIdOrKey: "NXAI-9", linkTypeName: "Blocks", direction: "outward" },
      "createIssueLink",
      { otherIssueIdOrKey: "NXAI-9" },
    ],
    [
      "labels",
      { add: ["bug"], remove: ["wontfix"] },
      "updateIssueFields",
      { issueIdOrKey: "NXAI-7", labels: { add: ["bug"], remove: ["wontfix"] } },
    ],
    [
      "priority",
      { priority: "High" },
      "updateIssueFields",
      { issueIdOrKey: "NXAI-7", priority: "High" },
    ],
    [
      "fix_version",
      { add: ["2.4.0"], remove: [] },
      "updateIssueFields",
      { issueIdOrKey: "NXAI-7", fixVersions: { add: ["2.4.0"], remove: [] } },
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

  it("creates a subtask in the Jira project id of the binding, never the app's project id", async () => {
    const { backend, accept } = setup();
    await accept(draft("subtask", { summary: "Write tests", estimateHours: 2 }));
    expect(backend.createSubtask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "10042",
        parentIssueIdOrKey: "NXAI-7",
        summary: "Write tests",
      }),
    );
  });

  it("will not create a subtask without the Jira project id", async () => {
    const { backend, accept } = setup({ externalProjectId: undefined as never });
    await expect(accept(draft("subtask", { summary: "x" }))).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
    expect(backend.createSubtask).not.toHaveBeenCalled();
  });

  it("never writes a description: it is reviewed and applied from the item view", async () => {
    const { backend, accept } = setup();
    await expect(accept(draft("description", { description: "New body" }))).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
    expect(backend.updateIssueDescription).not.toHaveBeenCalled();
  });

  it.each([
    ["hours", { estimateMode: "hours", estimateValue: 8 }],
    ["an unstated mode", { estimateValue: 8 }],
  ])("will not write an estimate with %s as story points", async (_name, patch) => {
    const { backend, accept } = setup();
    await expect(accept(draft("estimate", patch))).rejects.toBeInstanceOf(
      UnsupportedOperationError,
    );
    expect(backend.updateIssueEstimate).not.toHaveBeenCalled();
  });

  it.each([
    ["labels", { add: [], remove: [] }],
    ["priority", {}],
    ["fix_version", { add: "2.4.0" }],
  ])("will not write an unreadable %s patch", async (field, patch) => {
    const { backend, accept } = setup();
    await expect(accept(draft(field, patch))).rejects.toBeInstanceOf(UnsupportedOperationError);
    expect(backend.updateIssueFields).not.toHaveBeenCalled();
  });

  it("will not guess at a patch no reader understands", async () => {
    const { backend, accept } = setup();
    await expect(accept(draft("status", {}))).rejects.toBeInstanceOf(UnsupportedOperationError);
    expect(backend.updateIssueStatus).not.toHaveBeenCalled();
  });

  it("fails closed when the project key is unknown", async () => {
    const { backend, accept } = setup({ projectKey: undefined });
    await expect(accept(draft("status", { targetStatus: "Done" }))).rejects.toBeInstanceOf(
      RefusedOperationError,
    );
    expect(backend.updateIssueStatus).not.toHaveBeenCalled();
  });

  it("refuses a draft aimed at another provider or at another project", async () => {
    const { backend, accept } = setup();
    await expect(
      accept(
        draft("status", { targetStatus: "Done" }, { provider: "github", issueIdOrKey: "NXAI-7" }),
      ),
    ).rejects.toBeInstanceOf(RefusedOperationError);
    await expect(
      accept(
        draft("status", { targetStatus: "Done" }, { provider: "jira", issueIdOrKey: "OTHER-7" }),
      ),
    ).rejects.toBeInstanceOf(RefusedOperationError);
    expect(backend.updateIssueStatus).not.toHaveBeenCalled();
  });
});
