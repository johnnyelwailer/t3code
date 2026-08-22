/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Existing merged lint debt; keep green while preserving behavior. */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { loadGitHubInboxResponse } from "./t3team-github-inbox-loader.ts";
import {
  accountCache,
  inboxCache,
  pullRequestContextCache,
  pullRequestStateCache,
  repositorySearchCache,
  repositoriesCache,
  responseCache,
} from "./t3team-github-routes-shared.ts";
import type { VcsProcessOutput, VcsProcessShape } from "./t3team-vcsProcessShape.ts";

function processOutput(stdout: string): VcsProcessOutput {
  return {
    exitCode: ChildProcessSpawner.ExitCode(0),
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

afterEach(() => {
  accountCache.clear();
  inboxCache.clear();
  pullRequestContextCache.clear();
  pullRequestStateCache.clear();
  repositorySearchCache.clear();
  repositoriesCache.clear();
  responseCache.clear();
});

describe("loadGitHubInboxResponse repository discovery", () => {
  it("uses the authenticated GitHub repository list instead of public search results", async () => {
    const run = vi.fn<VcsProcessShape["run"]>((input) => {
      if (input.operation === "t3team.github.account") {
        return Effect.succeed(processOutput("johnnyelwailer\n"));
      }
      if (input.operation === "t3team.github.repositories") {
        return Effect.succeed(
          processOutput(
            JSON.stringify([
              {
                id: 1,
                full_name: "johnnyelwailer/nexi-distribution",
                html_url: "https://github.com/johnnyelwailer/nexi-distribution",
              },
              {
                id: 2,
                full_name: "acend-swai/nexi-distribution",
                html_url: "https://github.com/acend-swai/nexi-distribution",
              },
            ]),
          ),
        );
      }
      if (input.operation === "t3team.github.repository-search") {
        return Effect.succeed(
          processOutput(
            JSON.stringify({
              items: [
                {
                  id: 3,
                  full_name: "unrelated/nexi-ai",
                  html_url: "https://github.com/unrelated/nexi-ai",
                },
              ],
            }),
          ),
        );
      }
      return Effect.succeed(processOutput("[]"));
    });

    const result = await Effect.runPromise(
      loadGitHubInboxResponse(
        { run },
        {
          host: "github.com",
          projectKey: "NEXI",
          projectTitle: "Nexi Distribution",
          discoveryMode: "repositories",
        },
      ),
    );

    expect(result.suggestedRepositoryUrls).toEqual([
      "https://github.com/acend-swai/nexi-distribution",
      "https://github.com/johnnyelwailer/nexi-distribution",
    ]);
    expect(run.mock.calls.map(([input]) => input.operation)).toEqual([
      "t3team.github.account",
      "t3team.github.repositories",
    ]);
  });

  it("falls back to the complete repository list when fast search has no matching candidate", async () => {
    const run = vi.fn<VcsProcessShape["run"]>((input) => {
      if (input.operation === "t3team.github.account") {
        return Effect.succeed(processOutput("pj\n"));
      }
      if (input.operation === "t3team.github.repository-search") {
        return Effect.succeed(
          processOutput(
            JSON.stringify({
              items: [
                {
                  id: 1,
                  full_name: "hive/unrelated",
                  html_url: "https://nexplore.ghe.com/hive/unrelated",
                },
              ],
            }),
          ),
        );
      }
      if (input.operation === "t3team.github.repositories") {
        return Effect.succeed(
          processOutput(
            JSON.stringify([
              {
                id: 2,
                full_name: "pj/nexi-distribution",
                html_url: "https://nexplore.ghe.com/pj/nexi-distribution",
              },
            ]),
          ),
        );
      }
      return Effect.succeed(processOutput("[]"));
    });

    const result = await Effect.runPromise(
      loadGitHubInboxResponse(
        { run },
        {
          host: "nexplore.ghe.com",
          projectKey: "NEXI",
          projectTitle: "Nexi Distribution",
          discoveryMode: "repositories",
          linkedRepositoryUrls: ["https://nexplore.ghe.com/pj/nexi-distribution"],
        },
      ),
    );

    expect(result.suggestedRepositoryUrls).toEqual([
      "https://nexplore.ghe.com/pj/nexi-distribution",
    ]);
    expect(run.mock.calls.map(([input]) => input.operation)).toEqual([
      "t3team.github.account",
      "t3team.github.repository-search",
      "t3team.github.repositories",
    ]);
  });
});
