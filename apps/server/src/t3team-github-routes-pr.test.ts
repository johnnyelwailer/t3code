import { afterEach, describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { enrichPullRequestState } from "./t3team-github-routes-pr.ts";
import { pullRequestStateCache } from "./t3team-github-routes-shared.ts";
import { makeFakeGitHubApi, rateLimited, restOk } from "./t3team-githubRestApi.fixtures.ts";

afterEach(() => pullRequestStateCache.clear());

const notification = {
  id: "n1",
  repository: "acme/project",
  reason: "mention",
  subjectType: "PullRequest",
  subjectUrl: "https://nexplore.ghe.com/api/v3/repos/acme/project/pulls/7",
} as const;

describe("enrichPullRequestState", () => {
  it.effect("reads a pull request's state over GitHubApi, on the host's API path", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi(() =>
        restOk({
          state: "closed",
          merged_at: "2026-09-01T00:00:00Z",
          html_url: "https://nexplore.ghe.com/acme/project/pull/7",
          head: { ref: "feat/x" },
          user: { login: "alex-dev" },
          requested_reviewers: [{ login: "Me" }],
        }),
      );

      const {
        items: [item],
      } = yield* enrichPullRequestState("nexplore.ghe.com", [notification], "me").pipe(
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(calls).toEqual([
        {
          host: "nexplore.ghe.com",
          operation: "t3team.github.pr-state",
          path: "/repos/acme/project/pulls/7",
          allowReserve: false,
        },
      ]);
      expect(item).toMatchObject({
        subjectState: "merged",
        subjectBranch: "feat/x",
        authorLogin: "alex-dev",
        reviewRequested: true,
      });
    }),
  );

  it.effect(
    "reports the pause, with no guessed state, when the rate limit holds the read back",
    () =>
      Effect.gen(function* () {
        const { api, calls } = makeFakeGitHubApi((call) =>
          rateLimited(call.host, 1_790_000_000_000),
        );

        const { items, pausedMessage } = yield* enrichPullRequestState("nexplore.ghe.com", [
          notification,
        ]).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

        expect(items[0]?.subjectState).toBeUndefined();
        expect(items[0]?.subjectUrl).toBe("https://nexplore.ghe.com/acme/project/pull/7");
        expect(pausedMessage).toContain("nexplore.ghe.com are paused until 2026-09-21 14:13 UTC");
        expect(calls).toHaveLength(1);
        expect(pullRequestStateCache.size).toBe(0);
      }),
  );

  it.effect("keeps the row open, as gh did, when the read fails for another reason", () =>
    Effect.gen(function* () {
      const { api } = makeFakeGitHubApi((call) =>
        Effect.fail(
          new GitHubApi.GitHubApiNotFoundError({ host: call.host, operation: call.operation }),
        ),
      );

      const { items, pausedMessage } = yield* enrichPullRequestState("nexplore.ghe.com", [
        notification,
      ]).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(items[0]?.subjectState).toBe("open");
      expect(pausedMessage).toBeUndefined();
    }),
  );

  it.effect("reads each subject on the host its API URL names, not the inbox host", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi(() => restOk({ state: "open" }));
      const subject = (id: string, subjectUrl: string) => ({ ...notification, id, subjectUrl });

      yield* enrichPullRequestState("nexplore.ghe.com", [
        subject("a", "https://api.github.com/repos/acme/project/pulls/1"),
        subject("b", "https://git.acme.internal/api/v3/repos/acme/project/pulls/2"),
        subject("c", "https://api.tenant.ghe.com/repos/acme/project/pulls/3"),
        subject("d", "/repos/acme/project/pulls/4"),
        // Not any shape of GitHub API URL: no read, and so no credential used for it.
        subject("e", "https://evil.example.com/repos/acme/project/pulls/5"),
      ]).pipe(Effect.provideService(GitHubApi.GitHubApi, api));

      expect(calls.map((call) => [call.host, call.path]).toSorted()).toEqual([
        ["git.acme.internal", "/repos/acme/project/pulls/2"],
        ["github.com", "/repos/acme/project/pulls/1"],
        ["nexplore.ghe.com", "/repos/acme/project/pulls/4"],
        ["tenant.ghe.com", "/repos/acme/project/pulls/3"],
      ]);
    }),
  );
});
