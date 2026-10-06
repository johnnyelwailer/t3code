import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import { resetDigestPrCacheForTests } from "./t3team-myworkDigestPrCache.ts";
import { loadViewerMergedPrEntries } from "./t3team-myworkDigestMergedPrs.ts";
import { readDigestYesterday } from "./t3team-myworkDigestYesterdayRead.ts";

// Shapes from a live `gh search prs --merged --json ...closedAt` on nexplore.ghe.com, 2026-10-06.
const window = {
  fromMs: Date.parse("2026-10-04T22:00:00Z"),
  untilMs: Date.parse("2026-10-05T22:00:00Z"),
};
const hit = (repository: string, number: number, title: string, closedAt: string) => ({
  number,
  title,
  repository: { nameWithOwner: repository },
  closedAt,
});

/** gh signed in to two hosts; each answers its own search. A host in `failing` errors out. */
function makeGh(
  byHost: Record<string, ReadonlyArray<object>>,
  calls: Array<{ host: string; args: ReadonlyArray<string> }>,
  failing: ReadonlyArray<string> = [],
) {
  return Layer.mock(GitHubCli.GitHubCli)({
    execute: (input) => {
      if (input.args[0] === "auth") {
        const hosts = Object.fromEntries(Object.keys(byHost).map((host) => [host, []]));
        return Effect.succeed({
          stdout: JSON.stringify({ hosts }),
          stderr: "",
          exitCode: 0,
        } as never);
      }
      const host = String(input.env?.GH_HOST);
      calls.push({ host, args: input.args });
      return failing.includes(host)
        ? Effect.fail(new Error("gh failed") as never)
        : Effect.succeed({
            stdout: JSON.stringify(byHost[host] ?? []),
            stderr: "",
            exitCode: 0,
          } as never);
    },
  });
}

it.effect("searches every signed-in host for the viewer's merges and keeps the window's", () =>
  Effect.gen(function* () {
    const calls: Array<{ host: string; args: ReadonlyArray<string> }> = [];
    const entries = yield* loadViewerMergedPrEntries(window).pipe(
      Effect.provide(
        makeGh(
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
    assert.deepStrictEqual(calls[0]?.args.slice(0, 7), [
      "search",
      "prs",
      "--author",
      "@me",
      "--merged",
      "--merged-at",
      ">=2026-10-03",
    ]);
    assert.deepStrictEqual(calls.map((call) => call.host).toSorted(), [
      "github.com",
      "nexplore.ghe.com",
    ]);
  }),
);

it.effect("skips a host that fails this round", () =>
  Effect.gen(function* () {
    const calls: Array<{ host: string; args: ReadonlyArray<string> }> = [];
    const entries = yield* loadViewerMergedPrEntries(window).pipe(
      Effect.provide(
        makeGh(
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
    const calls: Array<{ host: string; args: ReadonlyArray<string> }> = [];
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
        makeGh(
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
