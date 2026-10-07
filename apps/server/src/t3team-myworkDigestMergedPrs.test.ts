import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/process";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";
import { resetDigestViewerLoginsForTests } from "./t3team-githubViewerSearch.ts";
import { resetDigestPrCacheForTests } from "./t3team-myworkDigestPrCache.ts";
import { loadViewerMergedPrEntries } from "./t3team-myworkDigestMergedPrs.ts";
import { readDigestYesterday } from "./t3team-myworkDigestYesterdayRead.ts";

// Shapes from a live `GET /search/issues` on nexplore.ghe.com, 2026-10-06.
const window = {
  fromMs: Date.parse("2026-10-04T22:00:00Z"),
  untilMs: Date.parse("2026-10-05T22:00:00Z"),
};
const hit = (repository: string, number: number, title: string, mergedAt: string) => ({
  number,
  title,
  repository_url: `https://api.example/repos/${repository}`,
  updated_at: mergedAt,
  closed_at: mergedAt,
  pull_request: { merged_at: mergedAt },
});

/** `gh auth status` answering with the hosts the viewer is signed in to. */
function authStatusLayer(hosts: ReadonlyArray<string>) {
  return Layer.mock(VcsProcess.VcsProcess)({
    run: () =>
      Effect.succeed({
        exitCode: ChildProcessSpawner.ExitCode(0),
        stdout: JSON.stringify({
          hosts: Object.fromEntries(
            hosts.map((host) => [
              host,
              [{ state: "success", active: true, host, login: "viewer" }],
            ]),
          ),
        }),
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      } as never),
  });
}

/** Each host answers its own search. A host in `failing` refuses. */
function makeGitHub(
  byHost: Record<string, ReadonlyArray<object>>,
  calls: Array<{ host: string; path: string }>,
  failing: ReadonlyArray<string> = [],
) {
  const api = Layer.mock(GitHubApi.GitHubApi)({
    rest: (input) => {
      if (failing.includes(input.host)) {
        return Effect.fail(
          new GitHubApi.GitHubApiRateLimitError({
            host: input.host,
            operation: input.operation,
          }) as never,
        );
      }
      const body = input.path.startsWith("user")
        ? JSON.stringify({ login: "viewer" })
        : JSON.stringify({ items: byHost[input.host] ?? [] });
      if (!input.path.startsWith("user?") && input.path !== "user") {
        calls.push({ host: input.host, path: input.path });
      }
      return Effect.succeed({
        status: 200,
        headers: {},
        body,
        truncated: false,
        invalidUtf8: false,
      } as never);
    },
  });
  return Layer.merge(api, authStatusLayer(Object.keys(byHost)));
}

const searchQuery = (path: string): string =>
  decodeURIComponent(/\bq=([^&]*)/.exec(path)?.[1] ?? "");

it.effect("searches every signed-in host for the viewer's merges and keeps the window's", () =>
  Effect.gen(function* () {
    resetDigestViewerLoginsForTests();
    const calls: Array<{ host: string; path: string }> = [];
    const entries = yield* loadViewerMergedPrEntries(window).pipe(
      Effect.provide(
        makeGitHub(
          {
            "github.com": [
              hit("a/b", 1, "in the window", "2026-10-05T10:00:00Z"),
              hit("a/b", 2, "before the window", "2026-10-04T21:59:00Z"),
              hit("a/b", 3, "at the end of the window", "2026-10-05T22:00:00Z"),
            ],
            "nexplore.ghe.com": [hit("hive/ies-alarm", 9, "IES-1 later", "2026-10-05T18:00:00Z")],
          },
          calls,
        ),
      ),
    );
    assert.deepStrictEqual(
      entries.map((entry) => [entry.host, entry.repository, entry.number, entry.state]),
      [
        ["nexplore.ghe.com", "hive/ies-alarm", 9, "merged"],
        ["github.com", "a/b", 1, "merged"],
      ],
    );
    // The query: mine, merged, a day before the window's UTC date (the exact window filters).
    assert.strictEqual(
      searchQuery(calls[0]?.path ?? ""),
      "is:pr is:merged author:viewer merged:>=2026-10-03",
    );
    assert.deepStrictEqual(calls.map((call) => call.host).toSorted(), [
      "github.com",
      "nexplore.ghe.com",
    ]);
  }),
);

it.effect("skips a host that fails this round", () =>
  Effect.gen(function* () {
    resetDigestViewerLoginsForTests();
    const calls: Array<{ host: string; path: string }> = [];
    const entries = yield* loadViewerMergedPrEntries(window).pipe(
      Effect.provide(
        makeGitHub(
          {
            "github.com": [hit("a/b", 1, "x", "2026-10-05T10:00:00Z")],
            "nexplore.ghe.com": [hit("c/d", 2, "y", "2026-10-05T11:00:00Z")],
          },
          calls,
          ["github.com"],
        ),
      ),
    );
    assert.deepStrictEqual(
      entries.map((entry) => entry.number),
      [2],
    );
  }),
);

it.effect("attaches merged PRs to the project whose Jira key the title names", () =>
  Effect.gen(function* () {
    resetDigestPrCacheForTests();
    resetDigestViewerLoginsForTests();
    const calls: Array<{ host: string; path: string }> = [];
    const result = yield* readDigestYesterday({
      window,
      assigned: [],
      tickets: [
        {
          id: "10",
          displayId: "IES-1",
          title: "t",
          url: "u",
          provider: "atlassian",
          kind: "issue",
        },
      ] as never,
      transitions: [],
    }).pipe(
      Effect.provide(
        makeGitHub(
          {
            "nexplore.ghe.com": [
              hit("hive/ies-alarm", 9, "IES-1 alarm fix", "2026-10-05T18:00:00Z"),
              hit("pj/nexi-distribution", 628, "feat: unrelated", "2026-10-05T19:00:00Z"),
              hit("hive/other", 4, "NXAI-5 another project", "2026-10-05T20:00:00Z"),
            ],
          },
          calls,
        ),
      ),
    );
    assert.deepStrictEqual(
      result.yesterday?.merged.map((pr) => [pr.number, pr.workItemKey]),
      [[9, "IES-1"]],
    );
    assert.strictEqual(result.pending, false);
  }),
);
