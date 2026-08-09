import { describe, expect, it } from "vite-plus/test";

import { readWorkItemFieldModel } from "./t3team-workItemSnapshotFields";

const BASE_SNAPSHOT = {
  ref: {
    provider: "atlassian",
    kind: "issue" as const,
    id: "TEST-1",
    displayId: "TEST-1",
    title: "Ticket",
    url: "https://example.test/browse/TEST-1",
    projectId: "external-1",
  },
  fetchedAt: "2026-05-21T00:00:00.000Z",
  fields: {
    assignee: {
      displayName: "Mona Deng",
      accountId: "user-1",
      avatarUrls: { "48x48": "https://secure.gravatar.com/avatar/mona" },
    },
    typeIconUrl: "https://api.atlassian.com/ex/jira/site-1/icon.png",
  },
};

describe("readWorkItemFieldModel", () => {
  it("routes the assignee avatar and issue-type icon through the asset proxy when accountId is known", () => {
    const model = readWorkItemFieldModel({
      snapshot: BASE_SNAPSHOT,
      fallbackKey: "TEST-1",
      accountId: "acct-1",
    });

    expect(model.assignee?.avatarUrl).toContain("/api/t3team/atlassian/asset/content?");
    expect(model.assignee?.displayName).toBe("Mona Deng");
    expect(model.issueTypeIconUrl).toContain("/api/t3team/atlassian/asset/content?");
  });

  it("leaves the raw Jira URLs in place without an accountId, rather than dropping them", () => {
    const model = readWorkItemFieldModel({
      snapshot: BASE_SNAPSHOT,
      fallbackKey: "TEST-1",
    });

    expect(model.assignee?.avatarUrl).toBe("https://secure.gravatar.com/avatar/mona");
    expect(model.issueTypeIconUrl).toBe("https://api.atlassian.com/ex/jira/site-1/icon.png");
  });
});
