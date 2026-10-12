import { afterEach, describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
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

      const [item] = yield* enrichPullRequestState("nexplore.ghe.com", [notification], "me").pipe(
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

  it.effect("keeps the row, uncached, when the read is held back by the rate limit", () =>
    Effect.gen(function* () {
      const { api, calls } = makeFakeGitHubApi((call) => rateLimited(call.host));

      const [item] = yield* enrichPullRequestState("nexplore.ghe.com", [notification]).pipe(
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(item?.subjectState).toBe("open");
      expect(item?.subjectUrl).toBe("https://nexplore.ghe.com/acme/project/pull/7");
      expect(calls).toHaveLength(1);
      expect(pullRequestStateCache.size).toBe(0);
    }),
  );
});
