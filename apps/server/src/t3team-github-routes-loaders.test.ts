import { describe, expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { VcsProcessOutput, VcsProcessShape } from "./t3team-vcsProcessShape.ts";
import { loadInboxAttempt } from "./t3team-github-routes-loaders.ts";

function processOutput(stdout: string): VcsProcessOutput {
  return {
    exitCode: ChildProcessSpawner.ExitCode(0),
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

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
        const run = vi.fn<VcsProcessShape["run"]>(() =>
          Effect.succeed(
            processOutput(
              JSON.stringify([
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
            ),
          ),
        );

        const result = yield* loadInboxAttempt(
          { run } as unknown as VcsProcessShape,
          "github.com",
          "alex-dev",
        );

        const byId = new Map(result.items.map((item) => [item.id, item]));
        expect(byId.get("n1")?.workItemKey).toBe("ABC-123");
        // No key in the title, so the chain falls through to the repository name.
        expect(byId.get("n2")?.workItemKey).toBe("DEF-42");
        expect(byId.get("n3")?.workItemKey).toBe(undefined);
      }),
  );
});
