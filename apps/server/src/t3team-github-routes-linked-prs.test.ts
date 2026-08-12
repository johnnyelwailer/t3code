import { describe, expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { VcsProcessExitError } from "@t3tools/contracts";

import type { VcsProcessOutput, VcsProcessShape } from "./t3team-vcsProcessShape.ts";
import { loadLinkedPullRequestsAttempt } from "./t3team-github-routes-linked-prs.ts";

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
        const run = vi.fn<VcsProcessShape["run"]>(() =>
          Effect.succeed(
            processOutput(
              JSON.stringify([
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
            ),
          ),
        );

        const result = yield* loadLinkedPullRequestsAttempt({
          vcs: { run } as unknown as VcsProcessShape,
          host: "github.com",
          account: "alex-dev",
          linkedRepositoryUrls: ["https://github.com/acme/project"],
        });

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
        const run = vi.fn<VcsProcessShape["run"]>((request) => {
          const args = request.args ?? [];
          const isBadRepo = args.some(
            (arg) => typeof arg === "string" && arg.includes("acme/broken"),
          );
          if (isBadRepo) {
            return Effect.fail(
              new VcsProcessExitError({
                operation: "t3team.github.repo-prs",
                command: "gh api",
                cwd: "/repo",
                exitCode: 1,
                failureKind: "command-failed",
                detail: "403 Forbidden",
              }),
            );
          }
          return Effect.succeed(
            processOutput(
              JSON.stringify([
                {
                  number: 1,
                  title: "Healthy PR",
                  state: "open",
                  html_url: "https://github.com/acme/project/pull/1",
                  head: { ref: "feature/healthy" },
                  user: { login: "alex-dev" },
                },
              ]),
            ),
          );
        });

        const result = yield* loadLinkedPullRequestsAttempt({
          vcs: { run } as unknown as VcsProcessShape,
          host: "github.com",
          account: "alex-dev",
          linkedRepositoryUrls: [
            "https://github.com/acme/project",
            "https://github.com/acme/broken",
          ],
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.id).toBe("pr:acme/project:1");
        expect(result.warning).toContain("acme/broken");
      }),
  );
});
