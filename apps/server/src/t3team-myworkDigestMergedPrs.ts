/**
 * The viewer's pull requests merged inside a time window, on every GitHub host gh is signed in
 * to — the sibling of `t3team-myworkDigestViewerPrs.ts`'s open-PR search, with the same host-wide
 * reach (a merge reaches its ticket whichever repository it landed in) and the same failure rule:
 * a host that fails this round is skipped, never the digest.
 *
 * `gh search prs` has no merge-time JSON field; `closedAt` of a merged PR is its merge time. Its
 * `--merged-at` qualifier takes a date, not an instant, so the query is padded by a day on each
 * side (the date is read in UTC, the window in the viewer's zone) and the exact window filters.
 */

import * as NodeOS from "node:os";

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import type { DigestYesterdayWindow } from "./t3team-myworkDigestYesterdayWindow.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

const MERGED_PR_LIMIT = "100";
const DAY_MS = 24 * 60 * 60 * 1000;

const decodeHits = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        number: Schema.Number,
        title: Schema.String,
        repository: Schema.Struct({ nameWithOwner: Schema.String }),
        closedAt: Schema.String,
      }),
    ),
  ),
);
const decodeHosts = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ hosts: Schema.Record(Schema.String, Schema.Unknown) })),
);

const utcDate = (ms: number): string => DateTime.formatIso(DateTime.makeUnsafe(ms)).slice(0, 10);

function searchHost(
  gh: GitHubCli.GitHubCli["Service"],
  host: string,
  window: DigestYesterdayWindow,
): Effect.Effect<DigestPrEntry[]> {
  return gh
    .execute({
      cwd: NodeOS.homedir(),
      args: [
        "search",
        "prs",
        "--author",
        "@me",
        "--merged",
        "--merged-at",
        `>=${utcDate(window.fromMs - DAY_MS)}`,
        "--limit",
        MERGED_PR_LIMIT,
        "--json",
        "number,title,repository,closedAt",
      ],
      env: { GH_HOST: host },
      rateLimitHost: host,
    })
    .pipe(
      Effect.map((output) => {
        const hits = decodeHits(output.stdout);
        return hits._tag === "Some" ? hits.value : [];
      }),
      Effect.orElseSucceed(() => []),
      Effect.map((hits) =>
        hits
          .filter((hit) => {
            const closedMs = Date.parse(hit.closedAt);
            return closedMs >= window.fromMs && closedMs < window.untilMs;
          })
          .map((hit): DigestPrEntry => ({
            host,
            repository: hit.repository.nameWithOwner,
            number: hit.number,
            title: hit.title,
            headBranch: "",
            state: "merged",
            isDraft: false,
            // The merge time: what the "Merged" rows show and sort by.
            updatedAt: hit.closedAt,
            viewerReviewRequested: false,
            viewerAuthored: true,
          })),
      ),
    );
}

/** Every signed-in host's PRs the viewer merged inside `window`, newest first. */
export function loadViewerMergedPrEntries(
  window: DigestYesterdayWindow,
): Effect.Effect<DigestPrEntry[], never, GitHubCli.GitHubCli> {
  return Effect.gen(function* () {
    const gh = yield* GitHubCli.GitHubCli;
    const status = yield* gh
      .execute({ cwd: NodeOS.homedir(), args: ["auth", "status", "--json", "hosts"] })
      .pipe(Effect.option);
    const parsed = status._tag === "Some" ? decodeHosts(status.value.stdout) : undefined;
    const hosts = parsed?._tag === "Some" ? Object.keys(parsed.value.hosts) : [];
    const perHost = yield* Effect.all(
      hosts.map((host) => searchHost(gh, host, window)),
      { concurrency: 4 },
    );
    return perHost.flat().toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  });
}
