/**
 * The viewer's open pull requests on every GitHub host gh is signed in to: the ones they wrote and
 * the ones waiting for their review. A host-wide search, not a per-repository listing, so a PR
 * reaches its ticket even when its repository is linked to another project, or to none (IES
 * tickets live in Jira, their code in a dozen `hive/ies-*` repositories).
 *
 * Read through the digest's PR cache (`t3team-myworkDigestPrCache.ts`): one read serves every
 * project, and a host that fails this round is skipped, never the digest.
 */

import * as NodeOS from "node:os";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

const VIEWER_PR_LIMIT = "100";
const SEARCH_FIELDS = "number,title,repository,updatedAt,isDraft,author";

const decodeHits = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        number: Schema.Number,
        title: Schema.String,
        repository: Schema.Struct({ nameWithOwner: Schema.String }),
        updatedAt: Schema.String,
        isDraft: Schema.Boolean,
        author: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
      }),
    ),
  ),
);
const decodeHosts = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ hosts: Schema.Record(Schema.String, Schema.Unknown) })),
);

function searchHost(
  gh: GitHubCli.GitHubCli["Service"],
  host: string,
  role: "author" | "review-requested",
): Effect.Effect<DigestPrEntry[]> {
  return gh
    .execute({
      cwd: NodeOS.homedir(),
      args: ["search", "prs", `--${role}`, "@me", "--state", "open"].concat([
        "--limit",
        VIEWER_PR_LIMIT,
        "--json",
        SEARCH_FIELDS,
      ]),
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
        hits.map((hit) => ({
          host,
          repository: hit.repository.nameWithOwner,
          number: hit.number,
          title: hit.title,
          // Search results carry no head branch; the title is where these name their ticket.
          headBranch: "",
          state: "open",
          isDraft: hit.isDraft,
          updatedAt: hit.updatedAt,
          viewerReviewRequested: role === "review-requested",
          viewerAuthored: role === "author",
          ...(hit.author?.login ? { authorLogin: hit.author.login } : {}),
        })),
      ),
    );
}

/** Every signed-in host's open PRs the viewer wrote or is asked to review, each PR once. */
export function loadViewerPrEntries(): Effect.Effect<DigestPrEntry[], never, GitHubCli.GitHubCli> {
  return Effect.gen(function* () {
    const gh = yield* GitHubCli.GitHubCli;
    const status = yield* gh
      .execute({ cwd: NodeOS.homedir(), args: ["auth", "status", "--json", "hosts"] })
      .pipe(Effect.option);
    const parsed = status._tag === "Some" ? decodeHosts(status.value.stdout) : undefined;
    const hosts = parsed?._tag === "Some" ? Object.keys(parsed.value.hosts) : [];
    const perHost = yield* Effect.all(
      hosts.flatMap((host) => [
        searchHost(gh, host, "author"),
        searchHost(gh, host, "review-requested"),
      ]),
      { concurrency: 4 },
    );
    // A PR both yours and up for your review (a shared branch) is kept once, as yours.
    const byKey = new Map<string, DigestPrEntry>();
    for (const entry of perHost.flat()) {
      const key = `${entry.host}:${entry.repository}#${entry.number}`;
      if (!byKey.has(key)) byKey.set(key, entry);
    }
    return [...byKey.values()];
  });
}

const KEY_IN_TITLE = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]+)-\d+/g;

/**
 * This project's share of the viewer's PRs: the ones whose title names an issue in one of the
 * project's Jira keys (`IES-…`), whoever's ticket it is — a colleague's ticket up for review
 * belongs here as much as the viewer's own. PRs the project's repository listing already carries
 * stay as that listing has them (it knows the head branch and checks).
 */
export function viewerPrsForProject(input: {
  readonly viewerEntries: ReadonlyArray<DigestPrEntry>;
  readonly projectEntries: ReadonlyArray<DigestPrEntry>;
  readonly ticketDisplayIds: ReadonlyArray<string | undefined>;
}): DigestPrEntry[] {
  const prefixes = new Set(
    input.ticketDisplayIds.flatMap((id) => {
      const prefix = id?.match(/^([A-Z][A-Z0-9]+)-\d+$/i)?.[1];
      return prefix ? [prefix.toUpperCase()] : [];
    }),
  );
  const listed = new Set(input.projectEntries.map((e) => `${e.host}:${e.repository}#${e.number}`));
  const own = input.projectEntries.map((entry) => {
    const viewer = input.viewerEntries.find(
      (v) =>
        v.host === entry.host && v.repository === entry.repository && v.number === entry.number,
    );
    return viewer?.viewerAuthored ? { ...entry, viewerAuthored: true } : entry;
  });
  const extra = input.viewerEntries.filter(
    (entry) =>
      !listed.has(`${entry.host}:${entry.repository}#${entry.number}`) &&
      [...entry.title.toUpperCase().matchAll(KEY_IN_TITLE)].some((m) => prefixes.has(m[1]!)),
  );
  return [...own, ...extra];
}
