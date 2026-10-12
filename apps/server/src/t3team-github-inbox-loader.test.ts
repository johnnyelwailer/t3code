import { afterEach, describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
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
  it.effect("uses the authenticated GitHub repository list instead of public search results", () =>
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
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(result.suggestedRepositoryUrls).toEqual([
        "https://github.com/acend-swai/nexi-distribution",
        "https://github.com/johnnyelwailer/nexi-distribution",
      ]);
      expect(calls.map((call) => call.operation)).toEqual([
        "t3team.github.account",
        "t3team.github.repositories",
      ]);
      // Setup discovery is a user waiting on the answer, so it may spend the reserve.
      expect(calls.every((call) => call.allowReserve)).toBe(true);
    }),
  );

  it.effect(
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

  it.effect("follows the repository list's next pages the way gh --paginate did", () =>
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
          page < 3 ? { link: '<https://api.github.com/user/repos?page=2>; rel="next"' } : {},
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

  it.effect("runs the activity refresh as a background read that never spends the reserve", () =>
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

  it.effect("answers a rate-limited account read with the pause, not a sign-in prompt", () =>
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

  it.effect("names the pause on each read that hit the rate limit after the account", () =>
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
