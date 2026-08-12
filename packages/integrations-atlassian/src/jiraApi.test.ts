import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AtlassianNetworkError } from "./client.ts";
import { JiraApiClient, JIRA_API_TIMEOUT_MS } from "./jiraApi.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("JiraApiClient", () => {
  it("requests OAuth Jira Cloud APIs through the cloud proxy with the REST path", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        accountId: "account-1",
        displayName: "Test User",
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "oauth",
      cloudId: "cloud-123",
      accessToken: "access-token",
    });

    await client.getMyself();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/myself",
      expect.any(Object),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://api.atlassian.com/ex/jira/cloud-123",
      expect.any(Object),
    );
  });

  it("lists a board's quick filters", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        values: [
          { id: 1, name: "My Open Issues", jql: "assignee = currentUser()" },
          { id: 2, name: "Recently Updated", jql: "updated >= -1d" },
        ],
        isLast: true,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const result = await client.listBoardQuickFilters("42");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/agile/1.0/board/42/quickfilter?maxResults=100",
      expect.any(Object),
    );
    expect(result.values).toEqual([
      { id: 1, name: "My Open Issues", jql: "assignee = currentUser()" },
      { id: 2, name: "Recently Updated", jql: "updated >= -1d" },
    ]);
  });

  it("aborts Jira requests that exceed the HTTP timeout", async () => {
    const timeoutController = new AbortController();
    const timeoutSignalSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutController.signal);

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          expect(init?.signal).toBeInstanceOf(AbortSignal);
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const errorPromise = client.getMyself().catch((error: unknown) => error);
    timeoutController.abort(new Error("timed out"));

    const error = await errorPromise;
    expect(timeoutSignalSpy).toHaveBeenCalledWith(JIRA_API_TIMEOUT_MS);
    expect(error).toBeInstanceOf(AtlassianNetworkError);
    expect(error).toMatchObject({
      _tag: "AtlassianNetworkError",
      cause: expect.objectContaining({
        message: `Atlassian request timed out after ${JIRA_API_TIMEOUT_MS}ms`,
      }),
    });
  });

  it("requests the widened issue field list with default expand", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        id: "1",
        key: "TEST-1",
        self: "https://test.atlassian.net/rest/api/3/issue/1",
        fields: {},
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await client.getIssue("TEST-1");

    const expectedFields = [
      "key",
      "summary",
      "parent",
      "subtasks",
      "issuelinks",
      "issuetype",
      "status",
      "priority",
      "assignee",
      "reporter",
      "labels",
      "description",
      "updated",
      "created",
      "comment",
      "project",
      "attachment",
      "duedate",
      "resolution",
      "resolutiondate",
      "timetracking",
      "worklog",
      "watches",
      "votes",
      "components",
      "fixVersions",
      "versions",
      "environment",
      "security",
    ].join(",");

    expect(fetchMock).toHaveBeenCalledWith(
      `https://test.atlassian.net/rest/api/3/issue/TEST-1?fields=${expectedFields}&expand=renderedFields`,
      expect.any(Object),
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "Cache-Control": "no-cache" }),
    });
  });

  it("merges extraFields into the issue field list without duplicating them", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        id: "1",
        key: "TEST-1",
        self: "https://test.atlassian.net/rest/api/3/issue/1",
        fields: {},
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await client.getIssue("TEST-1", ["customfield_10016", "created"]);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("customfield_10016");
    // "created" is already a base field — must not be duplicated.
    expect(calledUrl.match(/created/g)).toHaveLength(1);
  });

  it("adds changelog to expand only when expandChangelog is requested, leaving default behaviour unchanged", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        id: "1",
        key: "TEST-1",
        self: "https://test.atlassian.net/rest/api/3/issue/1",
        fields: {},
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await client.getIssue("TEST-1", [], { expandChangelog: true });
    const withChangelogUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(withChangelogUrl).toContain("expand=renderedFields,changelog");

    fetchMock.mockClear();
    await client.getIssue("TEST-1");
    const defaultUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(defaultUrl).toContain("expand=renderedFields");
    expect(defaultUrl).not.toContain("changelog");
  });

  it("edits a comment with a PUT to the comment resource", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "10001" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await client.editIssueComment("TEST-1", "10001", { type: "doc", version: 1, content: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issue/TEST-1/comment/10001",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("deletes a comment with a DELETE to the comment resource", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await client.deleteIssueComment("TEST-1", "10001");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issue/TEST-1/comment/10001",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates an issue link with the type and both issue sides", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await client.createIssueLink({
      type: { name: "Blocks" },
      inwardIssue: { key: "TEST-2" },
      outwardIssue: { key: "TEST-1" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issueLink",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: { name: "Blocks" },
          inwardIssue: { key: "TEST-2" },
          outwardIssue: { key: "TEST-1" },
        }),
      }),
    );
  });

  it("deletes an issue link by id", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await client.deleteIssueLink("10050");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issueLink/10050",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("lists issue link types", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        issueLinkTypes: [{ id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" }],
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new JiraApiClient({
      kind: "basic",
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const result = await client.getIssueLinkTypes();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/issueLinkType",
      expect.any(Object),
    );
    expect(result.issueLinkTypes).toEqual([
      { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" },
    ]);
  });
});
