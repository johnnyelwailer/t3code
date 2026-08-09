/**
 * Accept on a description draft: the gate, and what reaches Jira.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vite-plus/test";

import { createAtlassianIssueOpsApi } from "~/t3team/backend/t3team-atlassianBackendApiIssueOps";
import { shouldDisableDescriptionAccept } from "~/t3team/workitem/t3team-WorkItemDescriptionDraftDiff";

describe("shouldDisableDescriptionAccept", () => {
  it("allows accept once there is an account to write through and no open notes", () => {
    expect(shouldDisableDescriptionAccept({ canApply: true, pendingCommentCount: 0 })).toBe(false);
  });

  /** The invariant that predates the write route: notes on the table mean the draft goes back, not in. */
  it("keeps accept disabled while notes are open", () => {
    expect(shouldDisableDescriptionAccept({ canApply: true, pendingCommentCount: 1 })).toBe(true);
  });

  it("keeps accept disabled with no connected account", () => {
    expect(shouldDisableDescriptionAccept({ canApply: false, pendingCommentCount: 0 })).toBe(true);
  });
});

describe("updateIssueDescription", () => {
  it("posts the markdown as authored to the description route", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true });
    const api = createAtlassianIssueOpsApi(post as never);
    const markdown = "## Ziel\n\n- Rolle definieren\n- `Dev-Rolle` benennen\n";

    await api.updateIssueDescription({
      accountId: "account-1",
      issueIdOrKey: "NXAI-6",
      description: markdown,
    });

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/t3team/atlassian/issue/update-description");
    expect(body).toEqual({
      accountId: "account-1",
      issueIdOrKey: "NXAI-6",
      description: markdown,
    });
    // The regression to guard: no pre-rendering, escaping or flattening on the way out — the server owns
    // markdown→ADF, and a lossy projection written back to Jira is unrecoverable.
    expect(body.description).toBe(markdown);
  });

  it("lets the route's error surface to the caller", async () => {
    const post = vi.fn().mockRejectedValue(new Error("Description is not editable for NXAI-6"));
    const api = createAtlassianIssueOpsApi(post as never);

    await expect(
      api.updateIssueDescription({
        accountId: "account-1",
        issueIdOrKey: "NXAI-6",
        description: "body",
      }),
    ).rejects.toThrow("not editable");
  });
});
