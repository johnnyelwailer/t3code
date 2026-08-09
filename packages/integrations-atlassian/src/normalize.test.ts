import { describe, expect, it } from "@effect/vitest";
import {
  normalizeAccount,
  normalizeIssue,
  normalizeIssueSearch,
  normalizeProject,
} from "./normalize.ts";
import type { JiraIssue, JiraIssueSearchResponse, JiraProject } from "./client.ts";

describe("normalizeProject", () => {
  it("should normalize a Jira project", () => {
    const project: JiraProject = {
      id: "10001",
      key: "TEST",
      name: "Test Project",
      projectTypeKey: "software",
      avatarUrls: {
        "48x48": "https://example.com/48.png",
        "32x32": "https://example.com/32.png",
      },
      self: "https://test.atlassian.net/rest/api/3/project/10001",
    };

    const result = normalizeProject(project, "https://test.atlassian.net");

    expect(result).toEqual({
      id: "10001",
      provider: "atlassian",
      title: "Test Project",
      key: "TEST",
      url: "https://test.atlassian.net/rest/api/3/project/10001",
      description: undefined,
      iconUrl: "https://example.com/48.png",
      raw: {
        siteUrl: "https://test.atlassian.net",
        projectTypeKey: "software",
        avatarUrl: "https://example.com/48.png",
      },
    });
  });

  it("should fallback to generated URL when self is missing", () => {
    const project: JiraProject = {
      id: "10001",
      key: "TEST",
      name: "Test Project",
    };

    const result = normalizeProject(project, "https://test.atlassian.net");
    expect(result.url).toBe("https://test.atlassian.net/browse/TEST");
  });
});

describe("normalizeAccount", () => {
  it("should normalize a Jira user into an integration account", () => {
    const result = normalizeAccount("https://test.atlassian.net", {
      accountId: "abc123",
      displayName: "Test User",
    });

    expect(result).toEqual({
      id: "https://test.atlassian.net",
      provider: "atlassian",
      label: "Test User",
      accountUrl: "https://test.atlassian.net",
    });
  });
});

describe("normalizeIssue", () => {
  it("should normalize a Jira issue into a resource snapshot", () => {
    const issue: JiraIssue = {
      id: "10042",
      key: "TEST-1",
      self: "https://test.atlassian.net/rest/api/3/issue/10042",
      fields: {
        summary: "Fix the bug",
        issuetype: { name: "Bug" },
        status: { name: "In Progress" },
        priority: { name: "High" },
        assignee: { displayName: "Alice" },
        reporter: { displayName: "Bob" },
        labels: ["backend", "urgent"],
        description: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "It is broken." }] }],
        },
        updated: "2026-05-15T10:00:00.000Z",
        comment: {
          comments: [
            {
              id: "10001",
              author: { displayName: "Charlie" },
              body: "Looking into it.",
              created: "2026-05-15T09:00:00.000Z",
            },
          ],
        },
      },
    };

    const result = normalizeIssue(issue, "https://test.atlassian.net");

    expect(result.ref.id).toBe("TEST-1");
    expect(result.ref.displayId).toBe("TEST-1");
    expect(result.ref.title).toBe("Fix the bug");
    expect(result.ref.url).toBe("https://test.atlassian.net/browse/TEST-1");
    expect(result.summary).toBe("Fix the bug");
    expect(result.fields.status).toBe("In Progress");
    expect(result.fields.priority).toBe("High");
    expect(result.fields.assignee).toBe("Alice");
    expect(result.fields.reporter).toBe("Bob");
    expect(result.fields.type).toBe("Bug");
    expect(result.fields.labels).toEqual(["backend", "urgent"]);
    expect(result.ref.labels).toEqual(["backend", "urgent"]);
    expect(result.fields.description).toBe("It is broken.");
    expect(result.fields.comments).toContain("Charlie");
    expect(result.fields.comments).toContain("Looking into it.");
    expect(result.text).toContain("It is broken.");
    expect(result.text).toContain("Charlie");
  });

  it("should handle missing optional fields", () => {
    const issue: JiraIssue = {
      id: "10042",
      key: "TEST-2",
      self: "https://test.atlassian.net/rest/api/3/issue/10042",
      fields: {
        summary: "Empty issue",
        updated: "2026-05-15T10:00:00.000Z",
      },
    };

    const result = normalizeIssue(issue, "https://test.atlassian.net");

    expect(result.fields.status).toBeUndefined();
    expect(result.fields.assignee).toBeUndefined();
    expect(result.fields.comments).toBe("");
    expect(result.ref.labels).toBeUndefined();
  });
});

describe("normalizeIssue Slice A field widening", () => {
  it("surfaces the new read-parity fields, comment/attachment additions, and resolved story points/sprints", () => {
    const issue: JiraIssue = {
      id: "10099",
      key: "TEST-9",
      self: "https://test.atlassian.net/rest/api/3/issue/10099",
      fields: {
        summary: "Widen the read model",
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-05T00:00:00.000Z",
        duedate: "2026-02-01",
        resolution: { name: "Fixed" },
        resolutiondate: "2026-01-06T00:00:00.000Z",
        status: {
          name: "In Progress",
          statusCategory: { key: "indeterminate", name: "In Progress", colorName: "yellow" },
        },
        components: [{ name: "Backend" }],
        fixVersions: [{ name: "1.2.0" }],
        versions: [{ name: "1.0.0" }],
        environment: "Production, us-east-1",
        watches: { watchCount: 4, isWatching: true },
        votes: { votes: 2, hasVoted: false },
        timetracking: {
          originalEstimateSeconds: 7200,
          remainingEstimateSeconds: 3600,
          timeSpentSeconds: 3600,
        },
        customfield_10016: 5,
        description: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }],
        },
        parent: {
          key: "TEST-1",
          fields: {
            summary: "Parent epic",
            issuetype: { name: "Epic", iconUrl: "https://example.com/epic.svg" },
            status: { name: "Done" },
          },
        },
        comment: {
          comments: [
            {
              id: "20001",
              author: {
                displayName: "Charlie",
                accountId: "acc-charlie",
                avatarUrls: { "48x48": "https://example.com/charlie.png" },
              },
              body: {
                type: "doc",
                version: 1,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Looking into it." }] },
                ],
              },
              created: "2026-01-02T00:00:00.000Z",
              jsdPublic: false,
            },
          ],
        },
        attachment: [
          {
            id: "30001",
            filename: "trace.log",
            author: {
              accountId: "acc-dana",
              avatarUrls: { "48x48": "https://example.com/dana.png" },
            },
          },
        ],
      },
    };

    const result = normalizeIssue(issue, "https://test.atlassian.net", {
      estimateField: { id: "customfield_10016", label: "Story point estimate" },
      sprintField: null,
    });

    expect(result.fields.created).toBe("2026-01-01T00:00:00.000Z");
    expect(result.fields.dueDate).toBe("2026-02-01");
    expect(result.fields.resolution).toBe("Fixed");
    expect(result.fields.resolvedAt).toBe("2026-01-06T00:00:00.000Z");
    expect(result.fields.components).toEqual(["Backend"]);
    expect(result.fields.fixVersions).toEqual(["1.2.0"]);
    expect(result.fields.affectsVersions).toEqual(["1.0.0"]);
    expect(result.fields.environment).toBe("Production, us-east-1");
    expect(result.fields.watchCount).toBe(4);
    expect(result.fields.isWatching).toBe(true);
    expect(result.fields.voteCount).toBe(2);
    expect(result.fields.hasVoted).toBe(false);
    expect(result.fields.timeTracking).toEqual({
      originalEstimateSeconds: 7200,
      remainingEstimateSeconds: 3600,
      timeSpentSeconds: 3600,
    });
    expect(result.fields.storyPoints).toBe(5);
    expect(result.fields.sprints).toBeUndefined();
    expect(result.fields.statusCategory).toEqual({
      key: "indeterminate",
      name: "In Progress",
      colorName: "yellow",
    });
    expect(result.fields.descriptionAdf).toEqual(issue.fields.description);
    expect(result.fields.parentSummary).toEqual({
      key: "TEST-1",
      summary: "Parent epic",
      issueType: "Epic",
      issueTypeIconUrl: "https://example.com/epic.svg",
      statusName: "Done",
    });

    const commentItems = result.fields.commentItems as ReadonlyArray<Record<string, unknown>>;
    expect(commentItems[0]?.authorAccountId).toBe("acc-charlie");
    expect(commentItems[0]?.authorAvatarUrl).toBe("https://example.com/charlie.png");
    expect(commentItems[0]?.bodyAdf).toEqual(
      (issue.fields.comment as { comments: Array<{ body: unknown }> }).comments[0]?.body,
    );
    expect(commentItems[0]?.isInternal).toBe(true);

    const attachments = result.fields.attachments as ReadonlyArray<Record<string, unknown>>;
    expect(attachments[0]?.authorAccountId).toBe("acc-dana");
    expect(attachments[0]?.avatarUrl).toBe("https://example.com/dana.png");
  });

  it("omits new fields entirely when Jira returns nothing for them", () => {
    const issue: JiraIssue = {
      id: "10100",
      key: "TEST-10",
      self: "https://test.atlassian.net/rest/api/3/issue/10100",
      fields: {
        summary: "Bare issue",
        updated: "2026-01-05T00:00:00.000Z",
      },
    };

    const result = normalizeIssue(issue, "https://test.atlassian.net");

    for (const key of [
      "created",
      "dueDate",
      "resolution",
      "resolvedAt",
      "components",
      "fixVersions",
      "affectsVersions",
      "environment",
      "watchCount",
      "isWatching",
      "voteCount",
      "hasVoted",
      "timeTracking",
      "storyPoints",
      "sprints",
      "statusCategory",
      "descriptionAdf",
      "parentSummary",
    ]) {
      expect(Object.hasOwn(result.fields, key)).toBe(false);
    }
  });
});

describe("normalizeIssueSearch", () => {
  it("should normalize a Jira search response into resource refs", () => {
    const response: JiraIssueSearchResponse = {
      issues: [
        {
          id: "10042",
          key: "TEST-1",
          self: "https://test.atlassian.net/rest/api/3/issue/10042",
          fields: {
            summary: "Fix the bug",
            description: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Search text." }] }],
            },
            issuetype: { name: "Bug" },
            project: { id: "10001" },
            labels: ["backend", "urgent"],
          },
        },
        {
          id: "10043",
          key: "TEST-2",
          self: "https://test.atlassian.net/rest/api/3/issue/10043",
          fields: {
            summary: "Add feature",
            issuetype: { name: "Story" },
            project: { id: "10001" },
            parent: { key: "TEST-1" },
          },
        },
      ],
      total: 2,
    };

    const result = normalizeIssueSearch(response, "https://test.atlassian.net");

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("TEST-1");
    expect(result[0]?.title).toBe("Fix the bug");
    expect(result[0]?.description).toBe("Search text.");
    expect(result[0]?.type).toBe("Bug");
    expect(result[0]?.labels).toEqual(["backend", "urgent"]);
    expect(result[1]?.id).toBe("TEST-2");
    expect(result[1]?.title).toBe("Add feature");
    expect(result[1]?.type).toBe("Story");
    expect(result[1]?.parentId).toBe("TEST-1");
    expect(result[1]?.labels).toBeUndefined();
  });
});

describe("normalizeIssue parent relationships", () => {
  it("maps Jira parent key into snapshot ref.parentId", () => {
    const issue: JiraIssue = {
      id: "10044",
      key: "TEST-3",
      self: "https://test.atlassian.net/rest/api/3/issue/10044",
      fields: {
        summary: "Subtask",
        issuetype: { name: "Sub-task" },
        project: { id: "10001" },
        parent: { key: "TEST-1" },
      },
    };

    const normalized = normalizeIssue(issue, "https://test.atlassian.net");

    expect(normalized.ref.parentId).toBe("TEST-1");
  });
});
