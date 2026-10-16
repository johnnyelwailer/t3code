import { describe, expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import { loadInboxAttempt } from "./t3team-github-routes-loaders.ts";
import { makeFakeGitHubApi, rateLimited, restOk } from "./t3team-githubRestApi.fixtures.ts";

/**
 * The notifications inbox is the SECOND producer of `GitHubInboxItem`, and it has to stamp
 * `workItemKey` for the same reason the linked-PRs loader does: a consumer holding an item cannot
 * tell which loader produced it, so a field present on one path and absent on the other reads as
 * "this PR has no work item" rather than "this path does not resolve work items". That failure is
 * silent and wrong, which is worse than the field simply not existing.
 *
 * A notification carries no head branch, so the precedence chain has only title and repository
 * name to work with — which is exactly what the third case here pins down.
 */
describe("loadInboxAttempt", () => {
  it.effect(
    "stamps workItemKey from the notification subject title, falls back to the repository name, and leaves it undefined when neither carries a key",
    () =>
      Effect.gen(function* () {
        const { api, calls } = makeFakeGitHubApi(() =>
          restOk([
            {
              id: "n1",
              reason: "review_requested",
              repository: { full_name: "acme/project" },
              subject: {
                type: "PullRequest",
                title: "ABC-123 something",
                url: "https://api/1",
              },
              updated_at: "2026-08-09T00:00:00Z",
            },
            {
              id: "n2",
              reason: "mention",
              repository: { full_name: "acme/DEF-42-spike" },
              subject: {
                type: "PullRequest",
                title: "Refactor internals",
                url: "https://api/2",
              },
              updated_at: "2026-08-09T00:00:00Z",
            },
            {
              id: "n3",
              reason: "mention",
              repository: { full_name: "acme/project" },
              subject: {
                type: "PullRequest",
                title: "Refactor internals",
                url: "https://api/3",
              },
              updated_at: "2026-08-09T00:00:00Z",
            },
          ]),
        );

        const result = yield* loadInboxAttempt("github.com", "alex-dev").pipe(
          Effect.provideService(GitHubApi.GitHubApi, api),
        );

        const byId = new Map(result.items.map((item) => [item.id, item]));
        expect(byId.get("n1")?.workItemKey).toBe("ABC-123");
        // No key in the title, so the chain falls through to the repository name.
        expect(byId.get("n2")?.workItemKey).toBe("DEF-42");
        expect(byId.get("n3")?.workItemKey).toBe(undefined);
        // The notifications read goes through GitHubApi, then each pull request's state does.
        expect(calls[0]).toMatchObject({
          host: "github.com",
          operation: "t3team.github.inbox",
          path: "notifications?per_page=25",
        });
      }),
  );

  it.effect("says the host is paused when the notifications read hits the rate limit", () =>
    Effect.gen(function* () {
      const { api } = makeFakeGitHubApi((call) => rateLimited(call.host, 1_790_000_000_000));

      const result = yield* loadInboxAttempt("nexplore.ghe.com", "alex-dev").pipe(
        Effect.provideService(GitHubApi.GitHubApi, api),
      );

      expect(result.items).toEqual([]);
      expect(result.warning).toContain("nexplore.ghe.com are paused until 2026-09-21 14:13 UTC");
    }),
  );
});
