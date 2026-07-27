/**
 * Projection tests for the whole-project issues endpoint.
 *
 * The regression this guards: the work item detail view used to read the My
 * Work page (`assignee = currentUser()`), so a child assigned to somebody else
 * — or to nobody — could never be resolved and the "Child items" section
 * silently rendered empty. This projection must return the project's issues
 * regardless of assignee, and must never issue the currentUser JQL.
 *
 * Same harness as t3team-atlassian-myWork.test.ts: auth injected via
 * `replaceAtlassianAuths` so `providerForAccount` resolves a real
 * `AtlassianIntegrationProvider`, Jira HTTP stubbed at `globalThis.fetch`.
 */

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { replaceAtlassianAuths } from "./t3team-atlassian-auth-store.ts";
import { writeCachedT3TeamAtlassianBacklog } from "./t3team-atlassian-backlog-cache.ts";
import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import { loadT3TeamAtlassianProjectIssuesPage } from "./t3team-atlassian-projectIssues.ts";

const projectIssuesLayer = it.layer(
  Layer.mergeAll(
    SqlitePersistenceMemory,
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix: "t3team-atlassian-project-issues-test" }).pipe(
      Layer.provide(NodeServices.layer),
    ),
  ),
);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  replaceAtlassianAuths([]);
  vi.restoreAllMocks();
});

const currentUserJqlMarker = encodeURIComponent("assignee = currentUser()");

function connectBasicAuth(siteUrl: string): void {
  replaceAtlassianAuths([
    {
      accountId: siteUrl,
      auth: { kind: "basic", siteUrl, email: "user@example.com", apiToken: "token" },
    },
  ]);
}

function liveJiraIssue(key: string, projectId: string) {
  return {
    key,
    fields: {
      summary: `Live ${key}`,
      issuetype: { name: "Task" },
      status: { name: "To Do" },
      project: { id: projectId },
      updated: "2026-06-01T00:00:00.000Z",
    },
  };
}

function installJiraFetchMock(options: {
  readonly project: { readonly id: string; readonly key: string };
  readonly liveAssignedIssues: ReadonlyArray<ReturnType<typeof liveJiraIssue>>;
}): { readonly urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = vi.fn(async (input: string | URL) => {
    const url = input.toString();
    urls.push(url);
    if (url.includes("/rest/api/3/myself")) {
      return Response.json({ accountId: "viewer-1", displayName: "Viewer" });
    }
    if (url.includes("/rest/api/3/project/search")) {
      return Response.json({ values: [options.project] });
    }
    if (url.includes("/rest/api/3/field")) {
      return Response.json([]);
    }
    if (url.includes("/rest/api/3/search/jql")) {
      if (url.includes(currentUserJqlMarker)) {
        return Response.json({
          total: options.liveAssignedIssues.length,
          issues: options.liveAssignedIssues,
        });
      }
      // Mirror sync walk queries — empty, complete page.
      return Response.json({ issues: [], isLast: true });
    }
    return new Response(`Unexpected request: ${url}`, { status: 404 });
  }) as unknown as typeof fetch;
  return { urls };
}

// id === displayId === Jira key, matching normalize.ts semantics.
function mirrorIssue(key: string, overrides?: Partial<BacklogResourceRef>): BacklogResourceRef {
  return {
    provider: "atlassian",
    kind: "issue",
    id: key,
    displayId: key,
    title: `Issue ${key}`,
    status: "Todo",
    updatedAt: "2026-05-21T12:00:00.000Z",
    ...overrides,
  };
}

function seedMirror(input: {
  readonly accountId: string;
  readonly externalProjectId: string;
  readonly items: ReadonlyArray<BacklogResourceRef>;
}) {
  return writeCachedT3TeamAtlassianBacklog({
    provider: "atlassian",
    accountId: input.accountId,
    externalProjectId: input.externalProjectId,
    requestSelection: {},
    response: {
      page: { items: [...input.items], totalCount: input.items.length } satisfies ResourcePage,
      capabilities: { canCreateSubtasks: true },
      boards: [],
      sprints: [],
      savedFilters: [],
      quickFilters: [],
    },
  });
}

projectIssuesLayer("t3team Atlassian project issues projection", (it) => {
  it.effect("returns every mirrored issue regardless of assignee, with parent links intact", () =>
    Effect.gen(function* () {
      const site = "https://project-issues-a.atlassian.net";
      connectBasicAuth(site);
      const { urls } = installJiraFetchMock({
        project: { id: "project-a", key: "PRA" },
        liveAssignedIssues: [liveJiraIssue("PRA-1", "project-a")],
      });
      yield* seedMirror({
        accountId: site,
        externalProjectId: "project-a",
        items: [
          mirrorIssue("PRA-1", {
            assigneeAccountId: "viewer-1",
            updatedAt: "2026-05-21T12:00:00.000Z",
          }),
          // Unassigned child of PRA-1 — invisible to the My Work page, which is
          // exactly the bug this endpoint exists to fix.
          mirrorIssue("PRA-2", { parentId: "PRA-1", updatedAt: "2026-05-22T12:00:00.000Z" }),
          // Child assigned to a different person.
          mirrorIssue("PRA-3", {
            parentId: "PRA-1",
            assigneeAccountId: "someone-else",
            updatedAt: "2026-05-20T12:00:00.000Z",
          }),
        ],
      });

      const page = yield* loadT3TeamAtlassianProjectIssuesPage({
        account: { id: site, provider: "atlassian" },
        externalProjectId: "project-a",
      });

      // Newest first.
      assert.deepStrictEqual(
        page.items.map((item) => item.displayId),
        ["PRA-2", "PRA-1", "PRA-3"],
      );
      assert.strictEqual(page.totalCount, 3);
      assert.deepStrictEqual(
        page.items.filter((item) => item.parentId === "PRA-1").map((item) => item.displayId),
        ["PRA-2", "PRA-3"],
      );
      assert.ok(
        !urls.some((url) => url.includes(currentUserJqlMarker)),
        "the My Work JQL must never be issued by the project issues projection",
      );
    }),
  );

  it.effect("mirror not populated yet falls back to the live path for one response", () =>
    Effect.gen(function* () {
      const site = "https://project-issues-b.atlassian.net";
      connectBasicAuth(site);
      const { urls } = installJiraFetchMock({
        project: { id: "project-live", key: "PRL" },
        liveAssignedIssues: [liveJiraIssue("PRL-1", "project-live")],
      });
      // No mirror rows seeded for this project.

      const page = yield* loadT3TeamAtlassianProjectIssuesPage({
        account: { id: site, provider: "atlassian" },
        externalProjectId: "project-live",
      });

      assert.deepStrictEqual(
        page.items.map((item) => item.displayId),
        ["PRL-1"],
      );
      assert.ok(urls.some((url) => url.includes(currentUserJqlMarker)));
    }),
  );

  it.effect("consecutive reads over identical mirror rows return an identical ordering", () =>
    Effect.gen(function* () {
      const site = "https://project-issues-c.atlassian.net";
      connectBasicAuth(site);
      installJiraFetchMock({ project: { id: "project-c", key: "PRC" }, liveAssignedIssues: [] });
      // Identical updatedAt across rows stresses the ordering tiebreaker.
      yield* seedMirror({
        accountId: site,
        externalProjectId: "project-c",
        items: [mirrorIssue("PRC-2"), mirrorIssue("PRC-10"), mirrorIssue("PRC-1")],
      });

      const account = { id: site, provider: "atlassian" } as const;
      const first = yield* loadT3TeamAtlassianProjectIssuesPage({
        account,
        externalProjectId: "project-c",
      });
      const second = yield* loadT3TeamAtlassianProjectIssuesPage({
        account,
        externalProjectId: "project-c",
      });

      assert.deepStrictEqual(
        first.items.map((item) => item.displayId),
        ["PRC-1", "PRC-10", "PRC-2"],
      );
      assert.deepStrictEqual(first.items, second.items);
    }),
  );
});
