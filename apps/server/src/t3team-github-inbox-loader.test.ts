import { afterEach, describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";

import { ServerConfig } from "./config.ts";
import { writeStoredRepositoryList } from "./t3team-githubRepositoryListStore.ts";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { loadGitHubInboxResponse } from "./t3team-github-inbox-loader.ts";
import {
  accountCache,
  inboxCache,
  pullRequestContextCache,
  pullRequestStateCache,
  repositorySearchCache,
  repositoriesCache,
  responseCache,
} from "./t3team-github-routes-shared.ts";
import { makeFakeGitHubApi, rateLimited, restOk } from "./t3team-githubRestApi.fixtures.ts";

/** Each test gets its own state directory, so a stored repository list never leaks between tests. */
const itLoader = (
  name: string,
  body: () => Effect.Effect<void, never, FileSystem.FileSystem | Path.Path | ServerConfig>,
) =>
  it.effect(name, () =>
    body().pipe(
      Effect.provide(
        Layer.provideMerge(
          ServerConfig.layerTest("/tmp", { prefix: "t3-repo-list-" }),
          NodeServices.layer,
        ),
      ),
    ),
  );

afterEach(() => {
  accountCache.clear();
  inboxCache.clear();
  pullRequestContextCache.clear();
  pullRequestStateCache.clear();
  repositorySearchCache.clear();
  repositoriesCache.clear();
  responseCache.clear();
});

describe("loadGitHubInboxResponse repository discovery", () => {
  itLoader("uses the authenticated GitHub repository list instead of public search results", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) => {
        if (call.operation === "t3team.github.account") return restOk({ login: "johnnyelwailer" });
        if (call.operation === "t3team.github.repositories") {
          return restOk([
            {
              id: 1,
              full_name: "johnnyelwailer/nexi-distribution",
              html_url: "https://github.com/johnnyelwailer/nexi-distribution",
            },
            {
              id: 2,
              full_name: "acend-swai/nexi-distribution",
              html_url: "https://github.com/acend-swai/nexi-distribution",
            },
          ]);
        }
        if (call.operation === "t3team.github.repository-search") {
          return restOk({
            items: [
              {
                id: 3,
                full_name: "unrelated/nexi-ai",
                html_url: "https://github.com/unrelated/nexi-ai",
              },
            ],
          });
        }
        return restOk([]);
      });

      const result = yield* loadGitHubInboxResponse({
        host: "github.com",
        projectKey: "NEXI",
        projectTitle: "Nexi Distribution",
        discoveryMode: "repositories",
        trigger: "user",
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(result.suggestedRepositoryUrls).toEqual([
        "https://github.com/acend-swai/nexi-distribution",
        "https://github.com/johnnyelwailer/nexi-distribution",
      ]);
      expect(calls.map((call) => call.operation)).toEqual([
        "t3team.github.account",
        "t3team.github.repositories",
      ]);
      // An explicit refresh is a user waiting on the answer, so it may spend the reserve.
      expect(calls.every((call) => call.allowReserve)).toBe(true);
    }),
  );

  itLoader(
    "falls back to the complete repository list when fast search has no matching candidate",
    () =>
      Effect.gen(function* () {
        const { api, calls } = makeFakeGitHubApi((call) => {
          if (call.operation === "t3team.github.account") return restOk({ login: "pj" });
          if (call.operation === "t3team.github.repository-search") {
            return restOk({
              items: [
                {
                  id: 1,
                  full_name: "hive/unrelated",
                  html_url: "https://nexplore.ghe.com/hive/unrelated",
                },
              ],
            });
          }
          if (call.operation === "t3team.github.repositories") {
            return restOk([
              {
                id: 2,
                full_name: "pj/nexi-distribution",
                html_url: "https://nexplore.ghe.com/pj/nexi-distribution",
              },
            ]);
          }
          return restOk([]);
        });

        const result = yield* loadGitHubInboxResponse({
          host: "nexplore.ghe.com",
          projectKey: "NEXI",
          projectTitle: "Nexi Distribution",
          discoveryMode: "repositories",
          linkedRepositoryUrls: ["https://nexplore.ghe.com/pj/nexi-distribution"],
        }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

        expect(result.suggestedRepositoryUrls).toEqual([
          "https://nexplore.ghe.com/pj/nexi-distribution",
        ]);
        expect(calls.map((call) => call.operation)).toEqual([
          "t3team.github.account",
          "t3team.github.repository-search",
          "t3team.github.repositories",
        ]);
        // Every read targets the host the request names, not a hardcoded github.com.
        expect(new Set(calls.map((call) => call.host))).toEqual(new Set(["nexplore.ghe.com"]));
      }),
  );

  itLoader("follows the repository list's next pages the way gh --paginate did", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) => {
        if (call.operation === "t3team.github.account") return restOk({ login: "pj" });
        const page = Number(/[?&]page=(\d+)/.exec(call.path)?.[1] ?? "1");
        return restOk(
          [
            {
              id: page,
              full_name: `pj/repo-${String(page)}`,
              html_url: `https://github.com/pj/repo-${String(page)}`,
            },
          ],
          page < 3
            ? { link: `<https://api.github.com/user/repos?page=${String(page + 1)}>; rel="next"` }
            : {},
        );
      });

      const result = yield* loadGitHubInboxResponse({
        host: "github.com",
        discoveryMode: "repositories",
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(result.repositories.map((repository) => repository.nameWithOwner)).toEqual([
        "pj/repo-1",
        "pj/repo-2",
        "pj/repo-3",
      ]);
      expect(calls.filter((call) => call.operation === "t3team.github.repositories")).toHaveLength(
        3,
      );
    }),
  );

  itLoader("lets an explicit inbox refresh spend the reserve, whatever the mode", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) =>
        call.operation === "t3team.github.account" ? restOk({ login: "pj" }) : restOk([]),
      );

      yield* loadGitHubInboxResponse({ host: "github.com", trigger: "user" }).pipe(
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(calls.length).toBeGreaterThan(1);
      expect(calls.every((call) => call.allowReserve)).toBe(true);
    }),
  );

  itLoader("keeps repository-mode discovery in the background unless a user asked", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) =>
        call.operation === "t3team.github.account" ? restOk({ login: "pj" }) : restOk([]),
      );

      yield* loadGitHubInboxResponse({ host: "github.com", discoveryMode: "repositories" }).pipe(
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(calls.some((call) => call.allowReserve)).toBe(false);
    }),
  );

  itLoader("does not remember what the rate limit cut short, so the reset serves real data", () =>
    Effect.gen(function* () {
      let paused = true;
      const { api, calls } = makeFakeGitHubApi((call) => {
        if (call.operation === "t3team.github.account") return restOk({ login: "pj" });
        if (paused) return rateLimited(call.host, 1_790_000_000_000);
        return call.operation === "t3team.github.repositories"
          ? restOk([{ id: 1, full_name: "pj/app", html_url: "https://github.com/pj/app" }])
          : restOk([]);
      });
      const read = loadGitHubInboxResponse({
        host: "github.com",
        linkedRepositoryUrls: ["https://github.com/acme/project"],
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      const during = yield* read;
      expect(during.repositories).toEqual([]);
      expect(during.inboxWarning).toContain("paused until");

      // Nothing from the paused round is cached: not the response, the repositories or the inbox.
      expect(responseCache.size).toBe(0);
      expect(repositoriesCache.size).toBe(0);
      expect(inboxCache.size).toBe(0);

      paused = false;
      const reads = calls.length;
      const after = yield* read;
      expect(calls.length).toBeGreaterThan(reads);
      expect(after.repositories.map((repository) => repository.nameWithOwner)).toEqual(["pj/app"]);
      expect(after.inboxWarning).toBeUndefined();
    }),
  );

  itLoader("serves the stored list without asking GitHub again once memory has expired", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) => {
        if (call.operation === "t3team.github.account") return restOk({ login: "pj" });
        return call.operation === "t3team.github.repositories"
          ? restOk([{ id: 1, full_name: "pj/app", html_url: "https://github.com/pj/app" }])
          : restOk([]);
      });
      const read = loadGitHubInboxResponse({
        host: "github.com",
        discoveryMode: "repositories",
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));
      const listings = () =>
        calls.filter((call) => call.operation === "t3team.github.repositories").length;

      const first = yield* read;
      expect(listings()).toBe(1);
      expect(first.repositoriesFetchedAt).toBeDefined();

      repositoriesCache.clear();
      responseCache.clear();
      const second = yield* read;
      expect(listings()).toBe(1);
      expect(second.repositories.map((repository) => repository.nameWithOwner)).toEqual(["pj/app"]);
      expect(second.repositoriesFetchedAt).toBe(first.repositoriesFetchedAt);
      expect(second.repositoriesRefreshing).toBeUndefined();
    }),
  );

  itLoader("shows a stale stored list at once and refreshes it in the background", () =>
    Effect.gen(function* () {
      // The background refresh is held back by the rate limit, so it writes nothing into the test's
      // state directory while the test tears it down.
      const { api } = makeFakeGitHubApi((call) => {
        if (call.operation === "t3team.github.account") return restOk({ login: "pj" });
        return rateLimited(call.host, 1_790_000_000_000);
      });
      yield* writeStoredRepositoryList(
        "repos:github.com:pj",
        [
          {
            id: "1",
            nameWithOwner: "pj/old",
            url: "https://github.com/pj/old",
            host: "github.com",
          },
        ],
        "1970-01-01T00:00:00.000Z",
      );
      yield* TestClock.adjust("7 hours");
      const result = yield* loadGitHubInboxResponse({
        host: "github.com",
        discoveryMode: "repositories",
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));
      expect(result.repositories.map((repository) => repository.nameWithOwner)).toEqual(["pj/old"]);
      expect(result.repositoriesFetchedAt).toBe("1970-01-01T00:00:00.000Z");
      expect(result.repositoriesRefreshing).toBe(true);
    }),
  );

  itLoader("keeps showing the stored list when an explicit refresh hits the rate limit", () =>
    Effect.gen(function* () {
      const { api } = makeFakeGitHubApi((call) => {
        if (call.operation === "t3team.github.account") return restOk({ login: "pj" });
        return rateLimited(call.host, 1_790_000_000_000);
      });
      yield* writeStoredRepositoryList("repos:github.com:pj", [
        {
          id: "1",
          nameWithOwner: "pj/kept",
          url: "https://github.com/pj/kept",
          host: "github.com",
        },
      ]);
      const result = yield* loadGitHubInboxResponse({
        host: "github.com",
        discoveryMode: "repositories",
        refresh: true,
        trigger: "user",
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));
      expect(result.repositories.map((repository) => repository.nameWithOwner)).toEqual([
        "pj/kept",
      ]);
      expect(result.inboxWarning).toContain("paused until");
    }),
  );

  itLoader("runs the activity refresh as a background read that never spends the reserve", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) =>
        call.operation === "t3team.github.account" ? restOk({ login: "pj" }) : restOk([]),
      );

      yield* loadGitHubInboxResponse({
        host: "github.com",
        linkedRepositoryUrls: ["https://github.com/acme/project"],
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(calls.map((call) => call.operation)).toEqual([
        "t3team.github.account",
        "t3team.github.repositories",
        "t3team.github.inbox",
        "t3team.github.repo-prs",
      ]);
      expect(calls.some((call) => call.allowReserve)).toBe(false);
    }),
  );

  itLoader("answers a rate-limited account read with the pause, not a sign-in prompt", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) => rateLimited(call.host, 1_790_000_000_000));

      const result = yield* loadGitHubInboxResponse({ host: "nexplore.ghe.com" }).pipe(
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(result.account).toBeUndefined();
      expect(result.inboxWarning).toContain("paused until 2026-09-21 ");
      expect(result.inboxWarning).toContain("nexplore.ghe.com");
      expect(result.inboxWarning).not.toContain("gh auth login");
      // One read, no retry loop, and nothing else was attempted behind it.
      expect(calls).toHaveLength(1);
    }),
  );

  itLoader("names the pause on each read that hit the rate limit after the account", () =>
    Effect.gen(function* () {
      const { api } = makeFakeGitHubApi((call) =>
        call.operation === "t3team.github.account"
          ? restOk({ login: "pj" })
          : rateLimited(call.host),
      );

      const result = yield* loadGitHubInboxResponse({
        host: "github.com",
        linkedRepositoryUrls: ["https://github.com/acme/project"],
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(result.account).toBe("pj");
      expect(result.inboxWarning).toContain("paused until the rate limit resets");
      expect(result.inboxWarning).not.toContain("Unable to");
    }),
  );
});
