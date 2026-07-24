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
