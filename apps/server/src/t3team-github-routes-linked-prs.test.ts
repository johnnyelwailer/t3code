import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { loadLinkedPullRequestsAttempt } from "./t3team-github-routes-linked-prs.ts";
import { makeFakeGitHubApi, rateLimited, restOk } from "./t3team-githubRestApi.fixtures.ts";

/**
 * Coverage for the server-side work-item association added while moving
 * `apps/web/src/t3team/t3team-githubActivity.ts`'s logic into
 * `@t3tools/shared/t3team-githubActivity`: the linked-PRs loader must stamp `workItemKey` onto
 * each item itself, so a response already carries the association for callers with no browser to
 * run the web app's mapper in.
 */
describe("loadLinkedPullRequestsAttempt", () => {
  it.effect(
    "stamps workItemKey from the PR title, and leaves it undefined when no key is found anywhere",
    () =>
      Effect.gen(function* () {
        const { api, calls } = makeFakeGitHubApi(() =>
          restOk([
            {
              number: 1,
              title: "ABC-123 something",
              state: "open",
              html_url: "https://github.com/acme/project/pull/1",
              head: { ref: "feature/abc-123" },
              user: { login: "alex-dev" },
            },
            {
              number: 2,
              title: "Refactor internals",
              state: "open",
              html_url: "https://github.com/acme/project/pull/2",
              head: { ref: "chore/cleanup" },
              user: { login: "alex-dev" },
            },
          ]),
        );

        const result = yield* loadLinkedPullRequestsAttempt({
          account: "alex-dev",
          linkedRepositoryUrls: ["https://github.com/acme/project"],
        }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

        // A background read of the repository's pull requests through GitHubApi, not `gh api`.
        expect(calls).toEqual([
          {
            host: "github.com",
            operation: "t3team.github.repo-prs",
            path: "repos/acme/project/pulls?state=all&per_page=30&sort=updated&direction=desc",
            allowReserve: false,
          },
        ]);

        expect(result.items).toHaveLength(2);
        expect(result.items.find((item) => item.id === "pr:acme/project:1")?.workItemKey).toBe(
          "ABC-123",
        );
        expect(result.items.find((item) => item.id === "pr:acme/project:2")?.workItemKey).toBe(
          undefined,
        );
      }),
  );

  /**
   * A `gh api` failure for one linked repo (e.g. a 403 on a repo the account lost access to)
   * used to be swallowed into an empty item list with no signal, making it indistinguishable
   * from "this repo simply has no linked PRs" — a regression versus the loaders in
   * `t3team-github-routes-loaders.ts`, which already surface per-source failures via `warning`.
   * The failing repo must be named in `warning` while healthy repos still report their items.
   */
  it.effect(
    "surfaces a warning naming the failing repo while still returning items from healthy repos",
    () =>
      Effect.gen(function* () {
        const { api } = makeFakeGitHubApi((call) => {
          if (call.path.includes("acme/broken")) {
            return Effect.fail(
              new GitHubApi.GitHubApiResponseError({
                host: call.host,
                operation: call.operation,
                status: 403,
              }),
            );
          }
          return restOk([
            {
              number: 1,
              title: "Healthy PR",
              state: "open",
              html_url: "https://github.com/acme/project/pull/1",
              head: { ref: "feature/healthy" },
              user: { login: "alex-dev" },
            },
          ]);
        });

        const result = yield* loadLinkedPullRequestsAttempt({
          account: "alex-dev",
          linkedRepositoryUrls: [
            "https://github.com/acme/project",
            "https://github.com/acme/broken",
          ],
        }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.id).toBe("pr:acme/project:1");
        expect(result.warning).toContain("acme/broken");
      }),
  );

  /**
   * A reader signed into github.com and a GitHub Enterprise install links a repository on each.
   * The linked repository's URL names the host it lives on, and the read must go to that host
   * with that host's credentials — the Enterprise repository must not be dropped because a
   * request names a single (active-preferred) host, and its pull requests must still surface.
   */
  it.effect(
    "reads each linked repository on the host its URL names and returns items from both",
    () =>
      Effect.gen(function* () {
        const { api, calls } = makeFakeGitHubApi((call) =>
          call.host === "nexpore.ghe.com"
            ? restOk([
                {
                  number: 7,
                  title: "NEX-42 land the gateway",
                  state: "open",
                  html_url: "https://nexpore.ghe.com/acme/ghe-app/pull/7",
                  head: { ref: "feat/gateway" },
                  user: { login: "alex-dev" },
                },
              ])
            : restOk([
                {
                  number: 3,
                  title: "Commodity fix",
                  state: "open",
                  html_url: "https://github.com/acme/project/pull/3",
                  head: { ref: "fix/commodity" },
                  user: { login: "alex-dev" },
                },
              ]),
        );

        const result = yield* loadLinkedPullRequestsAttempt({
          account: "alex-dev",
          linkedRepositoryUrls: [
            "https://github.com/acme/project",
            "https://nexpore.ghe.com/acme/ghe-app",
          ],
        }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

        expect(calls.map((call) => call.host).toSorted()).toEqual([
          "github.com",
          "nexpore.ghe.com",
        ]);
        expect(result.items).toHaveLength(2);
        const enterprise = result.items.find((item) => item.id === "pr:acme/ghe-app:7");
        expect(enterprise?.repositoryUrl).toBe("https://nexpore.ghe.com/acme/ghe-app");
        expect(result.items.find((item) => item.id === "pr:acme/project:3")?.repositoryUrl).toBe(
          "https://github.com/acme/project",
        );
        expect(result.warning).toBeUndefined();
      }),
  );

  it.effect("reports the pause, once, when the rate limit holds the repositories back", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) => rateLimited(call.host, 1_790_000_000_000));

      const result = yield* loadLinkedPullRequestsAttempt({
        account: "alex-dev",
        linkedRepositoryUrls: ["https://github.com/acme/one", "https://github.com/acme/two"],
      }).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(result.items).toEqual([]);
      expect(result.warning).toBe(
        "GitHub requests to github.com are paused until 2026-09-21 14:13 UTC because of the rate limit.",
      );
      // Each repository was asked once; a refusal is never retried.
      expect(calls).toHaveLength(2);
    }),
  );
});
