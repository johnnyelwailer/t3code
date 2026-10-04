import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AtlassianIntegrationProvider } from "./provider.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const account = { id: "https://test.atlassian.net", provider: "atlassian" } as const;

function createProvider() {
  return new AtlassianIntegrationProvider({
    siteUrl: "https://test.atlassian.net",
    email: "user@example.com",
    apiToken: "token",
  });
}

/** Routes every Jira call the selection makes; `agile` answers the `/rest/agile/1.0` ones. */
function mockJira(agile: (url: string) => Response, requested: string[] = []) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    requested.push(decodeURIComponent(url));
    if (url.includes("/rest/api/3/project/search")) {
      return Response.json({ values: [{ id: "project-1", key: "PROJ" }] });
    }
    if (url.includes("/rest/api/3/filter/favourite")) return Response.json([]);
    if (url.includes("/rest/api/3/filter/search")) return Response.json({ values: [] });
    if (url.includes("/rest/api/3/filter/10530")) {
      return Response.json({ id: "10530", name: "Team board", jql: 'team = "PW" ORDER BY Rank' });
    }
    if (url.includes("/rest/api/3/field")) return Response.json([]);
    if (url.includes("/rest/agile/1.0/")) return agile(url);
    if (url.includes("/rest/api/3/search/jql")) return Response.json({ issues: [] });
    throw new Error(`Unexpected request: ${url}`);
  }) as unknown as typeof fetch;
}

const scopeMismatch = () =>
  new Response('{"code":401,"message":"Unauthorized; scope does not match"}', { status: 401 });

describe("backlog board scope", () => {
  it("flags a grant without the Jira Software scopes instead of failing silently", async () => {
    mockJira(scopeMismatch);

    const selection = await createProvider().getBacklogSelection({
      account,
      externalProjectId: "project-1",
      boardId: "95",
    });

    expect(selection.boardScopeMissing).toBe(true);
  });

  it("scopes the backlog to the board's own filter when the scopes are granted", async () => {
    const requested: string[] = [];
    mockJira((url) => {
      if (url.includes("/board?")) return Response.json({ values: [{ id: "95", name: "PW" }] });
      if (url.includes("/board/95/configuration")) return Response.json({ filter: { id: 10530 } });
      return Response.json({ values: [] });
    }, requested);
    const provider = createProvider();

    const selection = await provider.getBacklogSelection({
      account,
      externalProjectId: "project-1",
      boardId: "95",
    });
    expect(selection.boardScopeMissing).toBeUndefined();
    expect(selection.selectedFilterId).toBeUndefined();
    expect(selection.selectedFilterJql).toBe('team = "PW" ORDER BY Rank');

    await provider.listBacklogResources({
      account,
      externalProjectId: "project-1",
      boardId: "95",
      ...(selection.selectedFilterJql ? { filterJql: selection.selectedFilterJql } : {}),
    });
    expect(requested.some((url) => url.includes('(team = "PW") AND project = "PROJ"'))).toBe(true);
  });
});
