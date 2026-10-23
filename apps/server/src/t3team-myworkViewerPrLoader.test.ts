import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/process";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as VcsProcess from "./vcs/VcsProcess.ts";
import { resetDigestViewerLoginsForTests } from "./t3team-githubViewerSearch.ts";
import { loadViewerPrEntries, loadViewerPrRead } from "./t3team-myworkViewerPrLoader.ts";

const hit = (number: number) => ({
  number,
  title: `PR ${number}`,
  repository_url: "https://api.example/repos/o/r",
  updated_at: "2026-10-07T10:00:00Z",
  draft: false,
  user: { login: "me" },
});

type HostPlan = { author?: unknown[]; reviewRequested?: unknown[]; fail?: true };

/** `gh auth status` listing `hosts`; `gh` itself may be unavailable. */
const authStatus = (hosts: ReadonlyArray<string> | "unavailable") =>
  Layer.mock(VcsProcess.VcsProcess)({
    run: () =>
      hosts === "unavailable"
        ? Effect.fail("no gh" as never)
        : Effect.succeed({
            exitCode: ChildProcessSpawner.ExitCode(0),
            stdout: JSON.stringify({
              hosts: Object.fromEntries(
                hosts.map((host) => [
                  host,
                  [{ state: "success", active: true, host, login: "me" }],
                ]),
              ),
            }),
            stderr: "",
            stdoutTruncated: false,
            stderrTruncated: false,
          } as never),
  });

/** Each host answers `GET /user` and its searches page by page; a failing host refuses. */
const github = (searches: Record<string, HostPlan>) =>
  Layer.mock(GitHubApi.GitHubApi)({
    rest: (input) => {
      const plan = searches[input.host];
      if (plan === undefined || plan.fail === true) {
        return Effect.fail(
          new GitHubApi.GitHubApiRateLimitError({
            host: input.host,
            operation: input.operation,
          }) as never,
        );
      }
      const respond = (body: unknown) =>
        Effect.succeed({
          status: 200,
          headers: {},
          body: JSON.stringify(body),
          truncated: false,
          invalidUtf8: false,
        } as never);
      if (input.path === "user") return respond({ login: "me" });
      const query = decodeURIComponent(/\bq=([^&]*)/.exec(input.path)?.[1] ?? "");
      const page = Number(/\bpage=(\d+)/.exec(input.path)?.[1] ?? "1");
      const rows = (query.includes("author:") ? plan.author : plan.reviewRequested) ?? [];
      return respond({ items: rows.slice((page - 1) * 100, page * 100) });
    },
  });

const run = <A>(
  effect: Effect.Effect<A, never, GitHubApi.GitHubApi | VcsProcess.VcsProcess>,
  hosts: ReadonlyArray<string> | "unavailable",
  searches: Record<string, HostPlan>,
) =>
  Effect.sync(resetDigestViewerLoginsForTests).pipe(
    Effect.andThen(effect),
    Effect.provide(Layer.merge(github(searches), authStatus(hosts))),
  );

describe("loadViewerPrRead", () => {
  it.effect("keeps a PR that is both yours and up for review once, as yours", () =>
    Effect.gen(function* () {
      const searches = { "github.com": { author: [hit(1)], reviewRequested: [hit(1), hit(2)] } };
      const result = yield* run(loadViewerPrRead(), ["github.com"], searches);
      expect(result.incompleteHosts).toEqual([]);
      expect(
        result.entries.map((e) => [e.number, e.viewerAuthored, e.viewerReviewRequested]),
      ).toEqual([
        [1, true, false],
        [2, false, true],
      ]);
      expect(yield* run(loadViewerPrEntries(), ["github.com"], searches)).toEqual(result.entries);
    }),
  );

  it.effect("reads a host with 100 PRs to the end (one full page is not a cut-off)", () =>
    Effect.gen(function* () {
      const hundred = Array.from({ length: 100 }, (_, i) => hit(i + 1));
      const result = yield* run(loadViewerPrRead(), ["github.com"], {
        "github.com": { author: hundred },
      });
      expect(result.entries).toHaveLength(100);
      expect(result.incompleteHosts).toEqual([]);
      expect(result.truncatedHosts).toEqual([]);
      expect(result.signedInHosts).toEqual(["github.com"]);
    }),
  );

  it.effect("names a host whose search failed, or ran into the ceiling, as incomplete", () =>
    Effect.gen(function* () {
      const full = Array.from({ length: 1000 }, (_, i) => hit(i + 1));
      const result = yield* run(loadViewerPrRead(), ["ok.example", "down.example", "big.example"], {
        "ok.example": { author: [hit(1)] },
        "down.example": { fail: true },
        "big.example": { author: full },
      });
      expect([...result.incompleteHosts].toSorted()).toEqual(["big.example", "down.example"]);
      // Only the host that answered but hit the limit counts as read in part.
      expect(result.truncatedHosts).toEqual(["big.example"]);
      expect(result.entries.some((e) => e.host === "ok.example")).toBe(true);
    }),
  );

  it.effect("reports every host incomplete when gh cannot list its hosts", () =>
    Effect.gen(function* () {
      expect(yield* run(loadViewerPrRead(), "unavailable", {})).toEqual({
        entries: [],
        signedInHosts: [],
        incompleteHosts: ["*"],
        truncatedHosts: [],
      });
    }),
  );
});
