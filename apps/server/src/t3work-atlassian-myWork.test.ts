/**
 * Selection-logic tests for the My Work endpoint (Epic 33, Wave 3/4):
 * which of the two data paths — SQLite mirror projection vs live
 * `listResources` fallback — serves the response, and fingerprint stability
 * across consecutive polls over identical mirror data.
 *
 * Auth is injected via `replaceAtlassianAuths` (same pattern as
 * t3work-atlassian-auth-store.test.ts) so `providerForAccount` resolves a
 * real `AtlassianIntegrationProvider`; Jira HTTP is stubbed at
 * `globalThis.fetch`. The live path is detectable by its
 * `assignee = currentUser()` JQL, which the mirror path never issues.
 */

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ResourcePage } from "@t3tools/project-context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, vi } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { replaceAtlassianAuths } from "./t3work-atlassian-auth-store.ts";
import { writeCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cache.ts";
import type { BacklogResourceRef } from "./t3work-atlassian-backlog-cacheShared.ts";
import {
  loadT3workAtlassianMyWork,
  loadT3workAtlassianMyWorkPage,
} from "./t3work-atlassian-myWork.ts";

const myWorkLayer = it.layer(
  Layer.mergeAll(
    SqlitePersistenceMemory,
    NodeServices.layer,
    ServerConfig.layerTest(process.cwd(), { prefix: "t3work-atlassian-my-work-test" }).pipe(
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

/**
 * Minimal Jira REST router. Routes the endpoints touched by the foreground
 * request AND by the fire-and-forget mirror sync loop the endpoint kicks
 * (project search, field lookup, mirror JQL search), so background walks
 * complete quietly against empty pages instead of erroring.
 */
function installJiraFetchMock(options: {
  readonly myselfFails?: boolean;
  readonly project: { readonly id: string; readonly key: string };
  readonly liveAssignedIssues: ReadonlyArray<ReturnType<typeof liveJiraIssue>>;
}): { readonly urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    urls.push(url);
    if (url.includes("/rest/api/3/myself")) {
      return options.myselfFails
        ? new Response("Unauthorized", { status: 401 })
        : Response.json({ accountId: "viewer-1", displayName: "Viewer" });
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
      // Mirror sync walk queries — return an empty, complete page.
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
  return writeCachedT3workAtlassianBacklog({
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
    },
  });
}

myWorkLayer("t3work Atlassian My Work page selection", (it) => {
  it.effect(
    "mirror populated with zero assigned issues returns the empty projection without falling back to live",
    () =>
      Effect.gen(function* () {
        const site = "https://mywork-a.atlassian.net";
        connectBasicAuth(site);
        // The live path WOULD return an issue — so a non-empty result here
        // means the code wrongly fell back.
        const { urls } = installJiraFetchMock({
          project: { id: "project-a", key: "PRA" },
          liveAssignedIssues: [liveJiraIssue("PRA-9", "project-a")],
        });
        yield* seedMirror({
          accountId: site,
          externalProjectId: "project-a",
          items: [mirrorIssue("PRA-1", { assigneeAccountId: "someone-else" })],
        });

        const page = yield* loadT3workAtlassianMyWorkPage({
          account: { id: site, provider: "atlassian" },
          externalProjectId: "project-a",
        });

        assert.deepStrictEqual(page.items, []);
        assert.strictEqual(page.totalCount, 0);
        assert.ok(
          !urls.some((url) => url.includes(currentUserJqlMarker)),
          "live listResources (assignee = currentUser()) must not be queried",
        );
      }),
  );

  it.effect("mirror not populated yet falls back to the live listResources path", () =>
    Effect.gen(function* () {
      const site = "https://mywork-b.atlassian.net";
      connectBasicAuth(site);
      const { urls } = installJiraFetchMock({
        project: { id: "project-live", key: "PRL" },
        liveAssignedIssues: [liveJiraIssue("PRL-1", "project-live")],
      });
      // No mirror rows seeded for this project.

      const page = yield* loadT3workAtlassianMyWorkPage({
        account: { id: site, provider: "atlassian" },
        externalProjectId: "project-live",
      });

      assert.deepStrictEqual(
        page.items.map((item) => item.displayId),
        ["PRL-1"],
      );
      assert.ok(
        urls.some((url) => url.includes(currentUserJqlMarker)),
        "live listResources must have been queried",
      );
    }),
  );

  it.effect(
    "unresolvable viewer accountId falls back to live even when the mirror is populated",
    () =>
      Effect.gen(function* () {
        const site = "https://mywork-c.atlassian.net";
        connectBasicAuth(site);
        const { urls } = installJiraFetchMock({
          myselfFails: true,
          project: { id: "project-c", key: "PRC" },
          liveAssignedIssues: [liveJiraIssue("PRC-1", "project-c")],
        });
        // Mirror even holds an issue assigned to viewer-1 — unusable because
        // the viewer's accountId cannot be resolved.
        yield* seedMirror({
          accountId: site,
          externalProjectId: "project-c",
          items: [mirrorIssue("PRC-7", { assigneeAccountId: "viewer-1" })],
        });

        const page = yield* loadT3workAtlassianMyWorkPage({
          account: { id: site, provider: "atlassian" },
          externalProjectId: "project-c",
        });

        assert.deepStrictEqual(
          page.items.map((item) => item.displayId),
          ["PRC-1"],
        );
        assert.ok(urls.some((url) => url.includes(currentUserJqlMarker)));
      }),
  );

  it.effect(
    "two consecutive polls over identical mirror data yield the same fingerprint (unchanged)",
    () =>
      Effect.gen(function* () {
        const site = "https://mywork-fp.atlassian.net";
        connectBasicAuth(site);
        installJiraFetchMock({
          project: { id: "project-fp", key: "PRF" },
          liveAssignedIssues: [],
        });
        // Identical updatedAt across rows stresses the ORDER BY tiebreaker:
        // without deterministic ordering, item order — and therefore the
        // fingerprint — could differ between polls over unchanged data.
        yield* seedMirror({
          accountId: site,
          externalProjectId: "project-fp",
          items: [
            mirrorIssue("PRF-2", { assigneeAccountId: "viewer-1" }),
            mirrorIssue("PRF-1", { assigneeAccountId: "viewer-1", parentId: "PRF-10" }),
            mirrorIssue("PRF-3", { assigneeAccountId: "viewer-1" }),
            mirrorIssue("PRF-10"),
          ],
        });

        const account = { id: site, provider: "atlassian" } as const;

        const first = yield* loadT3workAtlassianMyWork({
          account,
          externalProjectId: "project-fp",
          poll: { enabled: true },
        });
        if (!("unchanged" in first)) {
          throw new Error("expected a poll result for the first poll");
        }
        assert.strictEqual(first.unchanged, false);

        const second = yield* loadT3workAtlassianMyWork({
          account,
          externalProjectId: "project-fp",
          poll: { enabled: true, knownFingerprint: first.fingerprint },
        });
        if (!("unchanged" in second)) {
          throw new Error("expected a poll result for the second poll");
        }
        assert.strictEqual(second.unchanged, true);
        assert.strictEqual(second.fingerprint, first.fingerprint);
      }),
  );
});
