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

  /**
   * A reader signed into github.com and a GitHub Enterprise install links a repository on each.
   * The linked repository's URL names the host it lives on, and the read must go to that host
   * with that host's `gh` credentials — the Enterprise repository must not be dropped because a
   * request names a single (active-preferred) host, and its pull requests must still surface.
   */
  it.effect(
    "reads each linked repository on the host its URL names and returns items from both",
    () =>
      Effect.gen(function* () {
        const hostsSeen: string[] = [];
        const run = vi.fn<VcsProcessShape["run"]>((request) => {
          const args = request.args ?? [];
          const hostnameIndex = args.indexOf("--hostname");
          const hostname =
            hostnameIndex >= 0 && typeof args[hostnameIndex + 1] === "string"
              ? (args[hostnameIndex + 1] as string)
              : null;
          hostsSeen.push(hostname ?? "none");
          if (hostname === "nexpore.ghe.com") {
            return Effect.succeed(
              processOutput(
                JSON.stringify([
                  {
                    number: 7,
                    title: "NEX-42 land the gateway",
                    state: "open",
                    html_url: "https://nexpore.ghe.com/acme/ghe-app/pull/7",
                    head: { ref: "feat/gateway" },
                    user: { login: "alex-dev" },
                  },
                ]),
              ),
            );
          }
          return Effect.succeed(
            processOutput(
              JSON.stringify([
                {
                  number: 3,
                  title: "Commodity fix",
                  state: "open",
                  html_url: "https://github.com/acme/project/pull/3",
                  head: { ref: "fix/commodity" },
                  user: { login: "alex-dev" },
                },
              ]),
            ),
          );
        });

        const result = yield* loadLinkedPullRequestsAttempt({
          vcs: { run } as unknown as VcsProcessShape,
          account: "alex-dev",
          linkedRepositoryUrls: [
            "https://github.com/acme/project",
            "https://nexpore.ghe.com/acme/ghe-app",
          ],
        });

        expect(hostsSeen.toSorted()).toEqual(["github.com", "nexpore.ghe.com"]);
        expect(result.items).toHaveLength(2);
        const enterprise = result.items.find((item) => item.id === "pr:acme/ghe-app:7");
        expect(enterprise?.repositoryUrl).toBe("https://nexpore.ghe.com/acme/ghe-app");
        expect(result.items.find((item) => item.id === "pr:acme/project:3")?.repositoryUrl).toBe(
          "https://github.com/acme/project",
        );
        expect(result.warning).toBeUndefined();
      }),
  );
});
