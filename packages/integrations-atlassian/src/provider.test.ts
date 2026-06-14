import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AtlassianIntegrationProvider } from "./provider.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("AtlassianIntegrationProvider", () => {
  it("normalizes bare Atlassian domains before connecting", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        accountId: "account-1",
        displayName: "Test User",
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "test.atlassian.net/",
      email: "user@example.com",
      apiToken: "token",
    });

    const accounts = await provider.listAccounts();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/rest/api/3/myself",
      expect.any(Object),
    );
    expect(accounts).toEqual([
      {
        id: "https://test.atlassian.net",
        provider: "atlassian",
        label: "Test User",
        accountUrl: "https://test.atlassian.net",
      },
    ]);
  });

  it("surfaces authentication failures instead of returning an empty site list", async () => {
    globalThis.fetch = vi.fn(async () => new Response("Unauthorized", { status: 401 }));

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "bad-token",
    });

    await expect(provider.listAccounts()).rejects.toThrow(
      "Failed to connect to Atlassian. https://test.atlassian.net: Authentication failed (401). Check your credentials or re-authenticate.",
    );
  });

  it("explains network failures without hiding the underlying cause", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(provider.listAccounts()).rejects.toThrow(
      "Check that the site URL is correct, the local backend can reach Atlassian, and the API token has Jira access.",
    );
  });

  it("includes parent issues for assigned subtasks", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.includes("/rest/api/3/search/jql")) {
        if (url.includes(encodeURIComponent("assignee = currentUser()"))) {
          return Response.json({
            total: 1,
            issues: [
              {
                key: "PROJ-2",
                fields: {
                  summary: "Assigned subtask",
                  parent: { key: "PROJ-1" },
                  issuetype: { name: "Sub-task" },
                  status: { name: "In Progress" },
                  priority: { name: "Medium" },
                  assignee: { displayName: "Me" },
                  project: { id: "project-1" },
                  updated: "2026-05-19T00:00:00.000Z",
                },
              },
            ],
          });
        }

        if (url.includes(encodeURIComponent('key in ("PROJ-1")'))) {
          return Response.json({
            total: 1,
            issues: [
              {
                key: "PROJ-1",
                fields: {
                  summary: "Parent story",
                  issuetype: { name: "Story" },
                  status: { name: "To Do" },
                  priority: { name: "High" },
                  project: { id: "project-1" },
                  updated: "2026-05-18T00:00:00.000Z",
                },
              },
            ],
          });
        }
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const page = await provider.listResources({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(page.items.map((item) => item.displayId)).toEqual(["PROJ-2", "PROJ-1"]);
    expect(page.totalCount).toBe(2);
  });

  it("keeps done issues in assigned my-work results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.includes("/rest/api/3/search/jql")) {
        expect(url).toContain(
          encodeURIComponent('project = "PROJ" AND assignee = currentUser() ORDER BY updated DESC'),
        );
        expect(url).not.toContain(encodeURIComponent("statusCategory != Done"));
        return Response.json({
          total: 1,
          issues: [
            {
              key: "PROJ-3",
              fields: {
                summary: "Recently completed",
                issuetype: { name: "Task" },
                status: { name: "Done" },
                priority: { name: "Medium" },
                assignee: { displayName: "Me" },
                project: { id: "project-1" },
                updated: "2026-05-20T00:00:00.000Z",
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const page = await provider.listResources({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(page.items.map((item) => item.displayId)).toEqual(["PROJ-3"]);
  });

  it("loads a project backlog without the current-user filter", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.endsWith("/rest/api/3/field")) {
        return Response.json([
          { id: "customfield_10016", name: "Story Points", schema: { type: "number" } },
          {
            id: "customfield_10020",
            name: "Sprint",
            schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" },
          },
        ]);
      }

      if (url.includes("/rest/api/3/search/jql")) {
        expect(url).toContain(
          encodeURIComponent('project = "PROJ" AND statusCategory != Done ORDER BY updated DESC'),
        );
        expect(url).not.toContain(encodeURIComponent("assignee = currentUser()"));
        return Response.json({
          total: 2,
          issues: [
            {
              key: "PROJ-9",
              fields: {
                summary: "Backlog story",
                description: "Capture the planning notes before the sprint starts.",
                issuetype: { name: "Story" },
                status: { name: "Backlog" },
                priority: { name: "High" },
                assignee: { accountId: "account-1", displayName: "Alex" },
                customfield_10016: 5,
                customfield_10020: [
                  {
                    id: 4487,
                    name: "Sprint 5",
                    state: "closed",
                    boardId: 2277,
                    endDate: "2026-05-18T21:30:00.000Z",
                    completeDate: "2026-05-20T08:16:07.579Z",
                  },
                  {
                    id: 4488,
                    name: "Sprint 6",
                    state: "active",
                    boardId: 2277,
                    startDate: "2026-05-20T10:05:36.454Z",
                    endDate: "2026-06-08T21:30:00.000Z",
                  },
                ],
                subtasks: [{ key: "PROJ-11" }],
                project: { id: "project-1" },
                updated: "2026-05-20T00:00:00.000Z",
              },
            },
            {
              key: "PROJ-10",
              fields: {
                summary: "Plan QA scope",
                issuetype: { name: "Task" },
                status: { name: "To Do" },
                priority: { name: "Medium" },
                project: { id: "project-1" },
                updated: "2026-05-19T00:00:00.000Z",
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const page = await provider.listBacklogResources({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(page.items.map((item) => item.displayId)).toEqual(["PROJ-9", "PROJ-10"]);
    expect(page.totalCount).toBe(2);
    expect(page.items[0]).toMatchObject({
      description: "Capture the planning notes before the sprint starts.",
      assigneeAccountId: "account-1",
      estimateValue: 5,
      subtaskCount: 1,
      sprintId: "4488",
      sprintName: "Sprint 6",
      sprintState: "active",
    });
  });

  it("loads official Jira board columns for the resolved backlog board", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.includes("/rest/api/3/filter/favourite")) {
        return Response.json([]);
      }

      if (url.includes("/rest/agile/1.0/board?") && url.includes("projectKeyOrId=PROJ")) {
        return Response.json({
          values: [{ id: "board-1", name: "Core board", type: "scrum" }],
        });
      }

      if (url.includes("/rest/agile/1.0/board/board-1/sprint")) {
        return Response.json({ values: [] });
      }

      if (url.includes("/rest/agile/1.0/board/board-1/configuration")) {
        return Response.json({
          columnConfig: {
            columns: [
              {
                name: "To Do",
                statuses: [{ id: "1", name: "To Do" }],
              },
              {
                name: "Ready For Test",
                statuses: [{ id: "2", name: "In Test" }],
              },
              {
                name: "Accepted",
                statuses: [{ id: "3", name: "Accepted" }],
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const selection = await provider.getBacklogSelection({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(selection.selectedBoardId).toBe("board-1");
    expect(selection.selectedBoardColumns).toEqual([
      {
        name: "To Do",
        statuses: [{ id: "1", name: "To Do" }],
      },
      {
        name: "Ready For Test",
        statuses: [{ id: "2", name: "In Test" }],
      },
      {
        name: "Accepted",
        statuses: [{ id: "3", name: "Accepted" }],
      },
    ]);
  });

  it("lists distinct Jira project statuses for workflow-backed filters", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.endsWith("/rest/api/3/project/project-1/statuses")) {
        return Response.json([
          {
            id: "10000",
            name: "Story",
            statuses: [
              { id: "1", name: "To Do" },
              { id: "2", name: "Code Review" },
            ],
          },
          {
            id: "10001",
            name: "Task",
            statuses: [
              { id: "2", name: "Code Review" },
              { id: "3", name: "Done" },
            ],
          },
        ]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const statuses = await provider.listProjectStatuses({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(statuses).toEqual([
      { id: "2", name: "Code Review" },
      { id: "3", name: "Done" },
      { id: "1", name: "To Do" },
    ]);
  });

  it("paginates backlog results so parent issues on later pages stay available", async () => {
    const issueForKey = (key: string, overrides?: Record<string, unknown>) => ({
      key,
      fields: {
        summary: `Summary for ${key}`,
        issuetype: { name: "Task" },
        status: { name: "To Do" },
        priority: { name: "Medium" },
        project: { id: "project-1" },
        updated: "2026-05-20T00:00:00.000Z",
        ...overrides,
      },
    });
    const allIssues = [
      issueForKey("PROJ-101", {
        parent: { key: "PROJ-201" },
      }),
      ...Array.from({ length: 99 }, (_, index) => issueForKey(`PROJ-${index + 1}`)),
      issueForKey("PROJ-201"),
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());

      if (url.pathname === "/rest/api/3/project/search") {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.pathname === "/rest/api/3/field") {
        return Response.json([]);
      }

      if (url.pathname === "/rest/api/3/search/jql") {
        const startAt = Number(url.searchParams.get("nextPageToken") ?? "0");
        const maxResults = Number(url.searchParams.get("maxResults") ?? "0");
        expect(maxResults).toBe(startAt === 0 ? 100 : 1);
        const end = startAt + maxResults;
        return Response.json({
          issues: allIssues.slice(startAt, end),
          ...(end < allIssues.length
            ? { nextPageToken: String(end), isLast: false }
            : { isLast: true }),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const page = await provider.listBacklogResources({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
      limit: 101,
    });

    const searchCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/rest/api/3/search/jql"),
    );
    expect(searchCalls).toHaveLength(2);
    expect(page.totalCount).toBe(101);
    expect(page.items.some((item) => item.displayId === "PROJ-201")).toBe(true);
    expect(page.items.find((item) => item.displayId === "PROJ-101")?.parentId).toBe("PROJ-201");
  });

  it("caps default backlog results to avoid unbounded project loads", async () => {
    const allIssues = Array.from({ length: 101 }, (_, index) => ({
      key: `PROJ-${index + 1}`,
      fields: {
        summary: `Summary for PROJ-${index + 1}`,
        issuetype: { name: "Task" },
        status: { name: "To Do" },
        priority: { name: "Medium" },
        project: { id: "project-1" },
        updated: "2026-05-20T00:00:00.000Z",
      },
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input.toString());

      if (url.pathname === "/rest/api/3/project/search") {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.pathname === "/rest/api/3/field") {
        return Response.json([]);
      }

      if (url.pathname === "/rest/api/3/search/jql") {
        const startAt = Number(url.searchParams.get("nextPageToken") ?? "0");
        const maxResults = Number(url.searchParams.get("maxResults") ?? "0");
        expect(maxResults).toBe(100);
        const end = startAt + maxResults;
        return Response.json({
          issues: allIssues.slice(startAt, end),
          ...(end < allIssues.length
            ? { nextPageToken: String(end), isLast: false }
            : { isLast: true }),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const page = await provider.listBacklogResources({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    const searchCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("/rest/api/3/search/jql"),
    );
    expect(searchCalls).toHaveLength(1);
    expect(page.items).toHaveLength(100);
    // /search/jql returns no total; a truncated page reports the fetched count
    // and signals more data via the continuation token.
    expect(page.totalCount).toBe(100);
    expect(page.nextCursor).toBe("100");
    expect(page.items.some((item) => item.displayId === "PROJ-101")).toBe(false);

    const continuation = await provider.listBacklogResources({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
      cursor: page.nextCursor as string,
    });
    expect(continuation.items.some((item) => item.displayId === "PROJ-101")).toBe(true);
    expect(continuation.nextCursor).toBeUndefined();
  });

  it("applies a selected Jira saved filter when loading the backlog", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.endsWith("/rest/api/3/field")) {
        return Response.json([]);
      }

      if (url.includes("/rest/api/3/search/jql")) {
        expect(url).toContain(
          encodeURIComponent(
            '(assignee = currentUser() AND labels = "planning") AND project = "PROJ" AND statusCategory != Done AND Sprint = 4488 ORDER BY updated DESC',
          ),
        );
        return Response.json({ total: 0, issues: [] });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.listBacklogResources({
        account: {
          id: "https://test.atlassian.net",
          provider: "atlassian",
        },
        externalProjectId: "project-1",
        sprintId: "4488",
        filterJql: 'assignee = currentUser() AND labels = "planning" ORDER BY created DESC',
      }),
    ).resolves.toEqual({ items: [], totalCount: 0 });
  });

  it("maps hour estimates for custom Jira subtasks even when the issue type name is Task", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.endsWith("/rest/api/3/field")) {
        return Response.json([]);
      }

      if (url.includes("/rest/api/3/search/jql")) {
        return Response.json({
          total: 1,
          issues: [
            {
              key: "PROJ-10",
              fields: {
                summary: "Custom Jira subtask",
                parent: { key: "PROJ-1" },
                issuetype: { name: "Task", subtask: true },
                status: { name: "To Do" },
                priority: { name: "Medium" },
                project: { id: "project-1" },
                timeoriginalestimate: 14400,
                timeestimate: 7200,
                updated: "2026-05-19T00:00:00.000Z",
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const page = await provider.listBacklogResources({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(page.items[0]).toMatchObject({
      displayId: "PROJ-10",
      type: "Task",
      issueTypeIsSubtask: true,
      estimateValue: 4,
      timeOriginalEstimateSeconds: 14400,
      timeRemainingEstimateSeconds: 7200,
    });
  });

  it("loads backlog board and sprint selections for a project", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.includes("/rest/agile/1.0/board?")) {
        return Response.json({
          values: [
            { id: 77, name: "Release board", type: "scrum" },
            { id: 12, name: "Kanban board", type: "kanban" },
          ],
        });
      }

      if (url.includes("/rest/api/3/filter/favourite?")) {
        return Response.json([
          {
            id: "17",
            name: "My open work",
            jql: "assignee = currentUser()",
            favourite: true,
            owner: { displayName: "PJ" },
          },
        ]);
      }

      if (url.includes("/rest/agile/1.0/board/77/sprint?")) {
        return Response.json({
          values: [
            {
              id: 4487,
              name: "Sprint 5",
              state: "closed",
              originBoardId: 77,
              endDate: "2026-05-18T21:30:00.000Z",
            },
            {
              id: 4488,
              name: "Sprint 6",
              state: "active",
              originBoardId: 77,
              startDate: "2026-05-20T10:05:36.454Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const selection = await provider.getBacklogSelection({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
      sprintId: "4488",
      filterId: "17",
    });

    expect(selection).toEqual({
      boards: [
        { id: "77", name: "Release board", type: "scrum" },
        { id: "12", name: "Kanban board", type: "kanban" },
      ],
      sprints: [
        {
          id: "4488",
          name: "Sprint 6",
          state: "active",
          boardId: "77",
          startDate: "2026-05-20T10:05:36.454Z",
        },
        {
          id: "4487",
          name: "Sprint 5",
          state: "closed",
          boardId: "77",
          endDate: "2026-05-18T21:30:00.000Z",
        },
      ],
      savedFilters: [
        {
          id: "17",
          name: "My open work",
          jql: "assignee = currentUser()",
          ownerDisplayName: "PJ",
          favourite: true,
        },
      ],
      selectedBoardId: "77",
      selectedSprintId: "4488",
      selectedFilterId: "17",
      selectedFilterJql: "assignee = currentUser()",
    });
  });

  it("keeps an explicitly requested sprint when Jira omits it from board sprint options", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.endsWith("/rest/api/3/field")) {
        return Response.json([
          {
            id: "customfield_10020",
            name: "Sprint",
            schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" },
          },
        ]);
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=PROJ")) {
        return Response.json({
          values: [{ id: 95, name: "Project board", type: "scrum" }],
        });
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=project-1")) {
        return Response.json({
          values: [{ id: 95, name: "Project board", type: "scrum" }],
        });
      }

      if (url.includes("/rest/api/3/filter/favourite?")) {
        return Response.json([]);
      }

      if (url.endsWith("/rest/agile/1.0/board/95")) {
        return Response.json({ id: 95, name: "Project board", type: "scrum" });
      }

      if (url.includes("/rest/agile/1.0/board/95/sprint?")) {
        return Response.json({
          values: [
            {
              id: 3183,
              name: "Sprint Closed",
              state: "closed",
              originBoardId: 95,
              endDate: "2026-05-31T10:00:00.000Z",
            },
          ],
        });
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent('project = "PROJ" AND Sprint in openSprints() ORDER BY updated DESC'),
        )
      ) {
        return Response.json({
          total: 1,
          issues: [
            {
              id: "10001",
              key: "PROJ-1",
              self: "https://test.atlassian.net/rest/api/3/issue/10001",
              fields: {
                customfield_10020: [
                  {
                    id: 3185,
                    name: "Sprint Active",
                    state: "active",
                    boardId: 95,
                    startDate: "2026-06-10T10:00:00.000Z",
                  },
                ],
              },
            },
          ],
        });
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent(
            'project = "PROJ" AND Sprint in futureSprints() ORDER BY updated DESC',
          ),
        )
      ) {
        return Response.json({ total: 0, issues: [] });
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent('project = "PROJ" AND Sprint is not EMPTY ORDER BY updated DESC'),
        )
      ) {
        return Response.json({ total: 0, issues: [] });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const selection = await provider.getBacklogSelection({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
      boardId: "95",
      sprintId: "3185",
    });

    expect(selection).toEqual({
      boards: [{ id: "95", name: "Project board", type: "scrum" }],
      sprints: [
        {
          id: "3185",
          name: "Sprint Active",
          state: "active",
          boardId: "95",
          startDate: "2026-06-10T10:00:00.000Z",
        },
        {
          id: "3183",
          name: "Sprint Closed",
          state: "closed",
          boardId: "95",
          endDate: "2026-05-31T10:00:00.000Z",
        },
      ],
      savedFilters: [],
      selectedBoardId: "95",
      selectedSprintId: "3185",
    });
  });

  it("puts the current Jira user first in assignable search results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/rest/api/3/myself")) {
        return Response.json({
          accountId: "account-me",
          displayName: "PJ",
        });
      }

      if (url.includes("/rest/api/3/user/assignable/search")) {
        return Response.json([
          {
            accountId: "account-other",
            displayName: "Alex",
          },
          {
            accountId: "account-me",
            displayName: "PJ",
          },
        ]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.searchAssignableUsers("https://test.atlassian.net", "PROJ-1"),
    ).resolves.toEqual([
      {
        accountId: "account-me",
        displayName: "PJ",
      },
      {
        accountId: "account-other",
        displayName: "Alex",
      },
    ]);
  });

  it("prefers Jira's default project board when the user has no active sprint participation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.includes("/rest/api/3/filter/favourite?")) {
        return Response.json([]);
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=PROJ")) {
        return Response.json({
          values: [
            { id: 2513, name: "Project overview", type: "scrum" },
            { id: 2277, name: "Developer board", type: "scrum" },
            { id: 2310, name: "Admin board", type: "kanban" },
          ],
        });
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=project-1")) {
        return Response.json({
          values: [
            { id: 2513, name: "Project overview", type: "scrum" },
            { id: 2277, name: "Developer board", type: "scrum" },
            { id: 2310, name: "Admin board", type: "kanban" },
          ],
        });
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent(
            'project = "PROJ" AND assignee = currentUser() AND Sprint in openSprints() ORDER BY updated DESC',
          ),
        )
      ) {
        return Response.json({ total: 0, issues: [] });
      }

      if (url.includes("/rest/agile/1.0/board/2513/sprint?")) {
        return Response.json({
          values: [
            {
              id: 4488,
              name: "Sprint 6",
              state: "active",
              originBoardId: 2277,
              startDate: "2026-05-20T10:05:36.454Z",
            },
            {
              id: 4489,
              name: "Sprint 7",
              state: "future",
              originBoardId: 2277,
              startDate: "2026-06-08T22:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const selection = await provider.getBacklogSelection({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(selection).toEqual({
      boards: [
        { id: "2513", name: "Project overview", type: "scrum" },
        { id: "2277", name: "Developer board", type: "scrum" },
        { id: "2310", name: "Admin board", type: "kanban" },
      ],
      sprints: [
        {
          id: "4488",
          name: "Sprint 6",
          state: "active",
          boardId: "2277",
          startDate: "2026-05-20T10:05:36.454Z",
        },
        {
          id: "4489",
          name: "Sprint 7",
          state: "future",
          boardId: "2277",
          startDate: "2026-06-08T22:00:00.000Z",
        },
      ],
      savedFilters: [],
      selectedBoardId: "2513",
      selectedSprintId: "4488",
    });
  });

  it("prefers the board and current sprint tied to the user's active sprint work", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.endsWith("/rest/api/3/field")) {
        return Response.json([
          {
            id: "customfield_10020",
            name: "Sprint",
            schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" },
          },
        ]);
      }

      if (url.includes("/rest/api/3/filter/favourite?")) {
        return Response.json([]);
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=PROJ")) {
        return Response.json({
          values: [
            { id: 2513, name: "Project overview", type: "scrum" },
            { id: 2277, name: "Developer board", type: "scrum" },
            { id: 2310, name: "Admin board", type: "kanban" },
          ],
        });
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=project-1")) {
        return Response.json({
          values: [
            { id: 2513, name: "Project overview", type: "scrum" },
            { id: 2277, name: "Developer board", type: "scrum" },
            { id: 2310, name: "Admin board", type: "kanban" },
          ],
        });
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent(
            'project = "PROJ" AND assignee = currentUser() AND Sprint in openSprints() ORDER BY updated DESC',
          ),
        )
      ) {
        return Response.json({
          total: 1,
          issues: [
            {
              id: "10001",
              key: "PROJ-9",
              self: "https://test.atlassian.net/rest/api/3/issue/10001",
              fields: {
                customfield_10020: [
                  {
                    id: 4488,
                    name: "Sprint 6",
                    state: "active",
                    boardId: 2277,
                    startDate: "2026-05-20T10:05:36.454Z",
                    endDate: "2026-06-08T21:30:00.000Z",
                  },
                ],
              },
            },
          ],
        });
      }

      if (url.includes("/rest/agile/1.0/board/2277/sprint?")) {
        return Response.json({
          values: [
            {
              id: 4488,
              name: "Sprint 6",
              state: "active",
              originBoardId: 2277,
              startDate: "2026-05-20T10:05:36.454Z",
              endDate: "2026-06-08T21:30:00.000Z",
            },
            {
              id: 4489,
              name: "Sprint 7",
              state: "future",
              originBoardId: 2277,
              startDate: "2026-06-08T22:00:00.000Z",
              endDate: "2026-06-28T22:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const selection = await provider.getBacklogSelection({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(selection).toEqual({
      boards: [
        { id: "2513", name: "Project overview", type: "scrum" },
        { id: "2277", name: "Developer board", type: "scrum" },
        { id: "2310", name: "Admin board", type: "kanban" },
      ],
      sprints: [
        {
          id: "4488",
          name: "Sprint 6",
          state: "active",
          boardId: "2277",
          startDate: "2026-05-20T10:05:36.454Z",
          endDate: "2026-06-08T21:30:00.000Z",
        },
        {
          id: "4489",
          name: "Sprint 7",
          state: "future",
          boardId: "2277",
          startDate: "2026-06-08T22:00:00.000Z",
          endDate: "2026-06-28T22:00:00.000Z",
        },
      ],
      savedFilters: [],
      selectedBoardId: "2277",
      selectedSprintId: "4488",
    });
  });

  it("defaults backlog selection to the active sprint when Jira does not return boards", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.endsWith("/rest/api/3/field")) {
        return Response.json([
          {
            id: "customfield_10020",
            name: "Sprint",
            schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" },
          },
        ]);
      }

      if (url.includes("/rest/agile/1.0/board?")) {
        return Response.json({ values: [] });
      }

      if (url.includes("/rest/api/3/filter/favourite?")) {
        return Response.json([]);
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent(
            'project = "PROJ" AND assignee = currentUser() AND Sprint in openSprints() ORDER BY updated DESC',
          ),
        )
      ) {
        return Response.json({ total: 0, issues: [] });
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent('project = "PROJ" AND Sprint is not EMPTY ORDER BY updated DESC'),
        )
      ) {
        return Response.json({
          total: 1,
          issues: [
            {
              id: "10001",
              key: "PROJ-9",
              self: "https://test.atlassian.net/rest/api/3/issue/10001",
              fields: {
                customfield_10020: [
                  {
                    id: 4487,
                    name: "Sprint 5",
                    state: "closed",
                    boardId: 2277,
                    endDate: "2026-05-18T21:30:00.000Z",
                  },
                  {
                    id: 4488,
                    name: "Sprint 6",
                    state: "active",
                    boardId: 2277,
                    startDate: "2026-05-20T10:05:36.454Z",
                  },
                ],
              },
            },
          ],
        });
      }

      if (url.endsWith("/rest/agile/1.0/board/2277")) {
        return Response.json({ id: 2277, name: "Release board", type: "scrum" });
      }

      if (url.includes("/rest/agile/1.0/board/2277/sprint?")) {
        return Response.json({
          values: [
            {
              id: 4487,
              name: "Sprint 5",
              state: "closed",
              originBoardId: 2277,
              endDate: "2026-05-18T21:30:00.000Z",
            },
            {
              id: 4488,
              name: "Sprint 6",
              state: "active",
              originBoardId: 2277,
              startDate: "2026-05-20T10:05:36.454Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const selection = await provider.getBacklogSelection({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(selection).toEqual({
      boards: [{ id: "2277", name: "Release board", type: "scrum" }],
      sprints: [
        {
          id: "4488",
          name: "Sprint 6",
          state: "active",
          boardId: "2277",
          startDate: "2026-05-20T10:05:36.454Z",
        },
        {
          id: "4487",
          name: "Sprint 5",
          state: "closed",
          boardId: "2277",
          endDate: "2026-05-18T21:30:00.000Z",
        },
      ],
      savedFilters: [],
      selectedBoardId: "2277",
      selectedSprintId: "4488",
    });
  });

  it("queries sprint boards by project id when the key-based board search misses", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/rest/api/3/project/search")) {
        return Response.json({
          values: [{ id: "project-1", key: "PROJ" }],
        });
      }

      if (url.includes("/rest/api/3/filter/favourite?")) {
        return Response.json([]);
      }

      if (
        url.includes("/rest/api/3/search/jql") &&
        url.includes(
          encodeURIComponent(
            'project = "PROJ" AND assignee = currentUser() AND Sprint in openSprints() ORDER BY updated DESC',
          ),
        )
      ) {
        return Response.json({ total: 0, issues: [] });
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=PROJ")) {
        return Response.json({ values: [] });
      }

      if (url.includes("/rest/agile/1.0/board?projectKeyOrId=project-1")) {
        return Response.json({
          values: [{ id: 2277, name: "Release board", type: "scrum" }],
        });
      }

      if (url.includes("/rest/agile/1.0/board/2277/sprint?")) {
        return Response.json({
          values: [
            {
              id: 4487,
              name: "Sprint 5",
              state: "closed",
              originBoardId: 2277,
              endDate: "2026-05-18T21:30:00.000Z",
            },
            {
              id: 4488,
              name: "Sprint 6",
              state: "active",
              originBoardId: 2277,
              startDate: "2026-05-20T10:05:36.454Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const selection = await provider.getBacklogSelection({
      account: {
        id: "https://test.atlassian.net",
        provider: "atlassian",
      },
      externalProjectId: "project-1",
    });

    expect(selection).toEqual({
      boards: [{ id: "2277", name: "Release board", type: "scrum" }],
      sprints: [
        {
          id: "4488",
          name: "Sprint 6",
          state: "active",
          boardId: "2277",
          startDate: "2026-05-20T10:05:36.454Z",
        },
        {
          id: "4487",
          name: "Sprint 5",
          state: "closed",
          boardId: "2277",
          endDate: "2026-05-18T21:30:00.000Z",
        },
      ],
      savedFilters: [],
      selectedBoardId: "2277",
      selectedSprintId: "4488",
    });
  });

  it("checks edit metadata before assigning issues", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/rest/api/3/issue/PROJ-9/editmeta")) {
        return Response.json({ fields: { assignee: {} } });
      }

      if (url.endsWith("/rest/api/3/issue/PROJ-9/assignee")) {
        expect(init?.method).toBe("PUT");
        expect(init?.body).toBe(JSON.stringify({ accountId: "account-1" }));
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.updateIssueAssignee("https://test.atlassian.net", "PROJ-9", "account-1"),
    ).resolves.toBeUndefined();
  });

  it("explains when the estimate field is missing from issue edit metadata", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/rest/api/3/field")) {
        return Response.json([
          { id: "customfield_10016", name: "Story Points", schema: { type: "number" } },
        ]);
      }

      if (url.endsWith("/rest/api/3/issue/PROJ-9/editmeta")) {
        return Response.json({ fields: { assignee: {} } });
      }

      if (url.endsWith("/rest/api/3/issue/PROJ-9")) {
        throw new Error("Estimate update should not reach Jira when editmeta rejects the field.");
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.updateIssueEstimate("https://test.atlassian.net", "PROJ-9", 5),
    ).rejects.toThrow(
      "Story Points is not editable for PROJ-9. Add it to the Jira edit screen for this issue type or update it directly in Jira.",
    );
  });

  it("updates hour-tracked issues through Jira time tracking", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/rest/api/3/issue/PROJ-9/editmeta")) {
        return Response.json({ fields: { timetracking: {} } });
      }

      if (url.endsWith("/rest/api/3/issue/PROJ-9")) {
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({
          fields: {
            timetracking: {
              originalEstimate: "1h 30m",
            },
          },
        });
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.updateIssueEstimate("https://test.atlassian.net", "PROJ-9", 1.5, "hours"),
    ).resolves.toEqual({ label: "Hours" });
  });

  it("does not update the remaining estimate when changing hour estimates", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/rest/api/3/issue/PROJ-9/editmeta")) {
        return Response.json({ fields: { timetracking: {} } });
      }

      if (url.endsWith("/rest/api/3/issue/PROJ-9")) {
        expect(init?.method).toBe("PUT");
        const body = JSON.parse(String(init?.body)) as {
          fields: { timetracking: Record<string, unknown> };
        };
        expect(body.fields.timetracking).toEqual({ originalEstimate: "2h" });
        expect(body.fields.timetracking).not.toHaveProperty("remainingEstimate");
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.updateIssueEstimate("https://test.atlassian.net", "PROJ-9", 2, "hours"),
    ).resolves.toEqual({ label: "Hours" });
  });

  it("transitions issues into the requested Jira status", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.endsWith("/rest/api/3/issue/PROJ-9/transitions") && init?.method == null) {
        return Response.json({
          transitions: [
            {
              id: "31",
              name: "Start progress",
              to: { name: "In Development", statusCategory: { key: "indeterminate" } },
            },
            {
              id: "32",
              name: "Send to review",
              to: { name: "Ready for Review", statusCategory: { key: "indeterminate" } },
            },
          ],
        });
      }

      if (url.endsWith("/rest/api/3/issue/PROJ-9/transitions") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ transition: { id: "32" } });
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.transitionIssueStatus("https://test.atlassian.net", "PROJ-9", "Ready for Review"),
    ).resolves.toEqual({ status: "Ready for Review" });
  });

  it("creates subtasks with optional description and estimated hours when Jira allows both", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (
        url.endsWith(
          "/rest/api/3/issue/createmeta?projectIds=10000&expand=projects.issuetypes.fields",
        )
      ) {
        return Response.json({
          projects: [
            {
              issuetypes: [
                {
                  id: "5",
                  name: "Sub-task",
                  subtask: true,
                  fields: {
                    description: {},
                    timetracking: {},
                  },
                },
              ],
            },
          ],
        });
      }

      if (url.endsWith("/rest/api/3/issue")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          fields: {
            project: { id: "10000" },
            parent: { key: "PROJ-9" },
            summary: "Capture follow-up steps",
            issuetype: { id: "5" },
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Coordinate handoff notes." }],
                },
              ],
            },
            timetracking: {
              originalEstimate: "2h 30m",
            },
          },
        });
        return Response.json({
          id: "10010",
          key: "PROJ-10",
          self: "https://test.atlassian.net/rest/api/3/issue/10010",
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    await expect(
      provider.createSubtask({
        accountId: "https://test.atlassian.net",
        projectId: "10000",
        parentIssueIdOrKey: "PROJ-9",
        summary: "Capture follow-up steps",
        description: "Coordinate handoff notes.",
        estimateHours: 2.5,
      }),
    ).resolves.toEqual({ id: "10010", key: "PROJ-10" });
  });

  it("downloads Jira attachment assets with the authenticated client", async () => {
    const bytes = Uint8Array.from([137, 80, 78, 71]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://test.atlassian.net/secure/attachment/10000/example.png") {
        return new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AtlassianIntegrationProvider({
      siteUrl: "https://test.atlassian.net",
      email: "user@example.com",
      apiToken: "token",
    });

    const asset = await provider.downloadAsset(
      "https://test.atlassian.net/secure/attachment/10000/example.png",
    );

    expect(asset).toEqual({
      bytes,
      mimeType: "image/png",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.atlassian.net/secure/attachment/10000/example.png",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "*/*",
        }),
      }),
    );
  });
});
