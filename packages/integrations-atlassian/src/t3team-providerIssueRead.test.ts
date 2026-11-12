import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AtlassianIntegrationProvider } from "./provider.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const provider = () =>
  new AtlassianIntegrationProvider({
    siteUrl: "https://test.atlassian.net",
    email: "user@example.com",
    apiToken: "token",
  });

const adf = (text: string) => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("AtlassianIntegrationProvider work-item reads", () => {
  it("searchIssuesByJql runs the JQL it is handed and pages with the tracker's token", async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/rest/api/3/field")) return Response.json([]);
      return Response.json({
        issues: [
          {
            id: "1",
            key: "IES-1",
            fields: {
              summary: "First",
              status: { name: "Open" },
              issuetype: { name: "Bug" },
              labels: ["a"],
            },
          },
        ],
        nextPageToken: "next",
        isLast: false,
      });
    }) as unknown as typeof fetch;

    const page = await provider().searchIssuesByJql({
      accountId: "https://test.atlassian.net",
      jql: "(status = Open) AND project in (10001)",
      limit: 7,
      cursor: "cur",
    });

    const search = urls.find((url) => url.includes("/search/jql"))!;
    const query = new URL(search).searchParams;
    expect(query.get("jql")).toBe("(status = Open) AND project in (10001)");
    expect(query.get("maxResults")).toBe("7");
    expect(query.get("nextPageToken")).toBe("cur");
    expect(page.items.map((item) => item.displayId)).toEqual(["IES-1"]);
    expect(page.nextCursor).toBe("next");
  });

  it("searchIssuesByJql ends paging on the last page", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/rest/api/3/field")
        ? Response.json([])
        : Response.json({ issues: [], nextPageToken: "stale", isLast: true }),
    ) as unknown as typeof fetch;
    const page = await provider().searchIssuesByJql({
      accountId: "https://test.atlassian.net",
      jql: "project in (1)",
    });
    expect(page).toEqual({ items: [], nextCursor: undefined });
  });

  it("listIssueComments asks for the newest page, returns it oldest-first and reports a cut", async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json({
        // The tracker answers newest-first because of `orderBy=-created`.
        comments: [
          { id: "2", body: "plain" },
          { id: "1", author: { displayName: "Pat" }, body: adf("ship it"), created: "2026-10-01" },
        ],
        total: 9,
      });
    }) as unknown as typeof fetch;
    const result = await provider().listIssueComments({
      accountId: "https://test.atlassian.net",
      issueIdOrKey: "IES-1",
      limit: 2,
    });
    const query = new URL(urls[0]!).searchParams;
    expect(query.get("maxResults")).toBe("2");
    expect(query.get("orderBy")).toBe("-created");
    expect(result.comments).toEqual([
      { id: "1", author: "Pat", body: "ship it", created: "2026-10-01" },
      { id: "2", body: "plain" },
    ]);
    expect(result.truncated).toBe(true);
  });

  it("listIssueComments is not truncated when every comment came back", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ comments: [{ id: "1", body: "only" }], total: 1 }),
    ) as unknown as typeof fetch;
    const result = await provider().listIssueComments({
      accountId: "https://test.atlassian.net",
      issueIdOrKey: "IES-1",
    });
    expect(result).toEqual({ comments: [{ id: "1", body: "only" }], truncated: false });
  });
});
