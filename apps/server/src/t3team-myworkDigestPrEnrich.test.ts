import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import { enrichPr } from "./t3team-myworkDigestPrEnrich.ts";

const actor = (login: string, extra: { isBot?: boolean; avatarUrl?: string } = {}) => ({
  login,
  name: login.toUpperCase(),
  avatarUrl: extra.avatarUrl ?? null,
  ...(extra.isBot ? { isBot: true } : {}),
});

const comment = (author: ReturnType<typeof actor>) => ({
  author,
  createdAt: "2026-10-01T00:00:00Z",
});

function service() {
  return {
    detail: () =>
      Effect.succeed({
        author: actor("alice", { avatarUrl: "https://avatars/alice" }),
        viewer: "pj",
        reviewers: [
          actor("pj"),
          actor("bob"),
          actor("copilot-pull-request-reviewer", { isBot: true }),
        ],
        additions: 10,
        deletions: 2,
        body: "",
      }),
    activity: () =>
      Effect.succeed({
        reviewers: [actor("bob", { avatarUrl: "https://avatars/bob" })],
        comments: [comment(actor("alice")), comment(actor("pj")), comment(actor("carol"))],
        reviewThreads: [
          {
            isResolved: false,
            comments: [comment(actor("copilot-pull-request-reviewer", { isBot: true }))],
          },
        ],
      }),
  } as never;
}

class RateLimitPaused extends Data.TaggedError("RateLimitPaused") {}
class SignedOut extends Data.TaggedError("PullRequestUnavailableError")<{
  readonly reason: "cli-unauthenticated";
}> {}

describe("enrichPr", () => {
  it.effect("names only other humans as reviewers and engaged, with the host's avatars", () =>
    Effect.gen(function* () {
      const enrichment = yield* enrichPr(service(), {
        projectId: ProjectId.make("p"),
        repository: "org/repo",
        number: 1,
      });
      expect(enrichment?.author).toEqual({
        name: "ALICE",
        login: "alice",
        avatarUrl: "https://avatars/alice",
      });
      // The viewer and bots are never "also asked" or "already on it"; the author is never engaged.
      expect(enrichment?.reviewers).toEqual([
        { name: "BOB", login: "bob", avatarUrl: "https://avatars/bob" },
      ]);
      expect(enrichment?.engaged?.map((person) => person.login)).toEqual(["carol"]);
    }),
  );

  it.effect("keeps the last good enrichment only while the host is rate-limiting", () =>
    Effect.gen(function* () {
      const ref = { projectId: ProjectId.make("p"), repository: "org/rate-limited", number: 7 };
      const good = yield* enrichPr(service(), ref);
      // The host's rate limit paused: both reads fail.
      const paused = {
        detail: () => Effect.fail(new RateLimitPaused()),
        activity: () => Effect.fail(new RateLimitPaused()),
      } as never;
      const degraded = yield* enrichPr(paused, ref);
      expect(degraded).toEqual(good);
      // A PR never read successfully still degrades to nothing, not to another PR's data.
      expect(yield* enrichPr(paused, { ...ref, number: 8 })).toBeUndefined();
      // Signed out (or a revoked token, a lost repo) is not a rate limit: no stale data.
      const signedOut = {
        detail: () => Effect.fail(new SignedOut({ reason: "cli-unauthenticated" })),
        activity: () => Effect.fail(new SignedOut({ reason: "cli-unauthenticated" })),
      } as never;
      expect(yield* enrichPr(signedOut, ref)).toBeUndefined();
    }),
  );
});
