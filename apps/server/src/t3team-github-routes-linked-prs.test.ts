import { describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

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
  it("stamps workItemKey from the PR title, and leaves it undefined when no key is found anywhere", async () => {
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

    const result = await Effect.runPromise(
      loadLinkedPullRequestsAttempt({
        vcs: { run } as unknown as VcsProcessShape,
        host: "github.com",
        account: "alex-dev",
        linkedRepositoryUrls: ["https://github.com/acme/project"],
      }),
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.id === "pr:acme/project:1")?.workItemKey).toBe(
      "ABC-123",
    );
    expect(result.items.find((item) => item.id === "pr:acme/project:2")?.workItemKey).toBe(
      undefined,
    );
  });
});
