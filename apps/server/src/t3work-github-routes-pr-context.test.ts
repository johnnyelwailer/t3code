/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Legacy async tests intentionally bridge Effect runtimes; tracked cleanup is separate from upstream green gate. */
import { describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { VcsProcessOutput, VcsProcessShape } from "./t3work-vcsProcessShape.ts";
import { loadPullRequestContext } from "./t3work-github-routes-pr-context.ts";

function processOutput(stdout: string): VcsProcessOutput {
  return {
    exitCode: ChildProcessSpawner.ExitCode(0),
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

describe("loadPullRequestContext", () => {
  it("loads a complete pull request package including diff, comments, and snapshots", async () => {
    const run = vi.fn<VcsProcessShape["run"]>((input) => {
      const path = input.args[input.args.length - 1];
      if (path === "/repos/acme/project/pulls/42") {
        if (input.args.includes("Accept: application/vnd.github.v3.diff")) {
          return Effect.succeed(
            processOutput(
              "diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-export const value = 'old';\n+export const value = 'new';\n",
            ),
          );
        }
        return Effect.succeed(
          processOutput(
            JSON.stringify({
              number: 42,
              title: "Refresh context bundle",
              state: "open",
              html_url: "https://github.com/acme/project/pull/42",
              user: { login: "alex-dev" },
              base: { ref: "main", sha: "base-sha" },
              head: { ref: "feature/pr-context", sha: "head-sha" },
              comments: 1,
              review_comments: 1,
              additions: 1,
              deletions: 1,
              changed_files: 1,
              commits: 1,
            }),
          ),
        );
      }

      if (path === "/repos/acme/project/pulls/42/files?per_page=100") {
        return Effect.succeed(
          processOutput(
            JSON.stringify([
              [
                {
                  filename: "src/foo.ts",
                  status: "modified",
                  additions: 1,
                  deletions: 1,
                  changes: 2,
                  patch: "@@ -1 +1 @@\n-export const value = 'old';\n+export const value = 'new';",
                },
              ],
            ]),
          ),
        );
      }

      if (path === "/repos/acme/project/pulls/42/reviews?per_page=100") {
        return Effect.succeed(processOutput(JSON.stringify([[{ id: 1, state: "COMMENTED" }]])));
      }

      if (path === "/repos/acme/project/pulls/42/comments?per_page=100") {
        return Effect.succeed(
          processOutput(
            JSON.stringify([[{ id: 2, path: "src/foo.ts", body: "Please rename this." }]]),
          ),
        );
      }

      if (path === "/repos/acme/project/issues/42/comments?per_page=100") {
        return Effect.succeed(
          processOutput(JSON.stringify([[{ id: 3, body: "Needs rollout notes." }]])),
        );
      }

      if (path === "/repos/acme/project/pulls/42/commits?per_page=100") {
        return Effect.succeed(
          processOutput(
            JSON.stringify([[{ sha: "abc1234", commit: { message: "Refresh context" } }]]),
          ),
        );
      }

      if (path === "/repos/acme/project/contents/src/foo.ts?ref=base-sha") {
        return Effect.succeed(
          processOutput(
            JSON.stringify({
              type: "file",
              size: 27,
              content: Buffer.from("export const value = 'old';\n").toString("base64"),
            }),
          ),
        );
      }

      if (path === "/repos/acme/project/contents/src/foo.ts?ref=head-sha") {
        return Effect.succeed(
          processOutput(
            JSON.stringify({
              type: "file",
              size: 27,
              content: Buffer.from("export const value = 'new';\n").toString("base64"),
            }),
          ),
        );
      }

      throw new Error(`Unexpected GitHub API call: ${path}`);
    });

    const result = await Effect.runPromise(
      loadPullRequestContext(
        { run },
        {
          host: "github.com",
          repository: "acme/project",
          subjectUrl: "https://github.com/acme/project/pull/42",
        },
      ),
    );

    expect(result.pullRequestNumber).toBe(42);
    expect(result.diff).toContain("diff --git a/src/foo.ts b/src/foo.ts");
    expect(result.reviews).toHaveLength(1);
    expect(result.reviewComments).toHaveLength(1);
    expect(result.issueComments).toHaveLength(1);
    expect(result.commits).toHaveLength(1);
    expect(result.fileSnapshots[0]?.base?.contents).toContain("old");
    expect(result.fileSnapshots[0]?.head?.contents).toContain("new");
    expect(run).toHaveBeenCalled();
  });
});
