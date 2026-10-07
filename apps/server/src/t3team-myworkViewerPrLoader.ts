/**
 * The viewer's open pull requests on every GitHub host gh is signed in to: the ones they wrote and
 * the ones waiting for their review. A host-wide search, not a per-repository listing, so a PR
 * reaches its ticket even when its repository is linked to another project, or to none (IES
 * tickets live in Jira, their code in a dozen `hive/ies-*` repositories).
 *
 * Two consumers read it: the My Work digest (through its PR cache; a host that fails this round
 * is skipped, never the digest) and the `scm.viewer.change-requests` signal source, which also
 * needs to know WHICH hosts failed — a PR missing because its host was unreachable is not a PR
 * that went away. `loadViewerPrRead` carries that; `loadViewerPrEntries` is the entries alone.
 */

import * as NodeOS from "node:os";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as GitHubCli from "./sourceControl/GitHubCli.ts";
import type { T3TeamDigestProjectSource } from "./t3team-myworkDigestTypes.ts";

type DigestPrEntry = T3TeamDigestProjectSource["prEntries"][number];

const VIEWER_PR_LIMIT = 100;
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

/** The hosts gh is signed in to; `ok` is false when gh could not say, which is not "none". */
export function readSignedInHosts(
  gh: GitHubCli.GitHubCli["Service"],
): Effect.Effect<{ readonly hosts: ReadonlyArray<string>; readonly ok: boolean }> {
  return gh.execute({ cwd: NodeOS.homedir(), args: ["auth", "status", "--json", "hosts"] }).pipe(
    Effect.option,
    Effect.map((status) => {
      const parsed = status._tag === "Some" ? decodeHosts(status.value.stdout) : undefined;
      return parsed?._tag === "Some"
        ? { hosts: Object.keys(parsed.value.hosts), ok: true }
        : { hosts: [], ok: false };
    }),
  );
}

/** One search's answer. A search that failed, or hit the limit, did not see every PR. */
type SearchRead = { readonly entries: DigestPrEntry[]; readonly complete: boolean };

function searchHost(
  gh: GitHubCli.GitHubCli["Service"],
  host: string,
  role: "author" | "review-requested",
): Effect.Effect<SearchRead> {
  return gh
    .execute({
      cwd: NodeOS.homedir(),
      args: ["search", "prs", `--${role}`, "@me", "--state", "open"].concat([
        "--limit",
        String(VIEWER_PR_LIMIT),
        "--json",
        SEARCH_FIELDS,
      ]),
      env: { GH_HOST: host },
      rateLimitHost: host,
    })
    .pipe(
      Effect.map((output) => decodeHits(output.stdout)),
      Effect.orElseSucceed(() => undefined),
      Effect.map((decoded): SearchRead => {
        const hits = decoded?._tag === "Some" ? decoded.value : undefined;
        return {
          complete: hits !== undefined && hits.length < VIEWER_PR_LIMIT,
          entries: (hits ?? []).map((hit) => ({
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
        };
      }),
    );
}

/** What one read of the viewer's PRs saw, and which hosts it could not see all of. */
export interface ViewerPrRead {
  readonly entries: DigestPrEntry[];
  /** Hosts whose search failed or was cut off. `"*"` when gh could not even list its hosts. */
  readonly incompleteHosts: ReadonlyArray<string>;
}

/** Every signed-in host's open PRs the viewer wrote or is asked to review, each PR once. */
export function loadViewerPrRead(): Effect.Effect<ViewerPrRead, never, GitHubCli.GitHubCli> {
  return Effect.gen(function* () {
    const gh = yield* GitHubCli.GitHubCli;
    const signedIn = yield* readSignedInHosts(gh);
    const perSearch = yield* Effect.all(
      signedIn.hosts.flatMap((host) =>
        (["author", "review-requested"] as const).map((role) =>
          searchHost(gh, host, role).pipe(Effect.map((read) => ({ host, read }))),
        ),
      ),
      { concurrency: 4 },
    );
    // A PR both yours and up for your review (a shared branch) is kept once, as yours.
    const byKey = new Map<string, DigestPrEntry>();
    for (const entry of perSearch.flatMap(({ read }) => read.entries)) {
      const key = `${entry.host}:${entry.repository}#${entry.number}`;
      if (!byKey.has(key)) byKey.set(key, entry);
    }
    const incomplete = new Set(perSearch.filter(({ read }) => !read.complete).map((s) => s.host));
    return {
      entries: [...byKey.values()],
      incompleteHosts: signedIn.ok ? [...incomplete] : ["*"],
    };
  });
}

/** The entries alone — what the digest reads. */
export function loadViewerPrEntries(): Effect.Effect<DigestPrEntry[], never, GitHubCli.GitHubCli> {
  return loadViewerPrRead().pipe(Effect.map((read) => read.entries));
}
