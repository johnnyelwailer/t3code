/**
 * Following GitHub's `Link: <url>; rel="next"` header, the one way the fork pages a REST list.
 * Every paged read (repository discovery, the checks revalidator) asks this for the next page
 * instead of counting `page=N` itself, so a page cursor GitHub chose is used as given and a
 * `Link` that points anywhere but this host's API base is refused rather than followed.
 */

import * as Effect from "effect/Effect";

import * as GitHubApi from "./GitHubRequestPolicy.ts";

/** Each `<url>` of a `Link` header with its parameters (`rel="next"`, ...). */
const LINK_ENTRY = /<([^>]*)>([^<]*)/g;

/**
 * The API-root-relative path (query included) of the page a `Link` header names as `next`, `null`
 * when it names none. Fails when the link leaves `host`'s API base, so a response can never steer
 * the credentialed next request to another origin or path.
 */
export function nextPagePath(input: {
  readonly host: string;
  readonly operation: string;
  readonly link: string | undefined;
}): Effect.Effect<string | null, GitHubApi.GitHubApiResponseError> {
  if (input.link === undefined) return Effect.succeed(null);
  let target: string | undefined;
  for (const [, url, parameters] of input.link.matchAll(LINK_ENTRY)) {
    if (url !== undefined && /;\s*rel="?next"?/i.test(parameters ?? "")) target = url;
  }
  if (target === undefined) return Effect.succeed(null);
  const refused = Effect.fail(
    new GitHubApi.GitHubApiResponseError({
      host: input.host,
      operation: input.operation,
      status: 200,
      githubErrors: ["The next page link leaves the API base."],
    }),
  );
  try {
    const base = new URL(GitHubApi.gitHubApiUrls(input.host).rest);
    const next = new URL(target);
    const root = base.pathname.replace(/\/+$/, "");
    if (next.origin !== base.origin || !next.pathname.startsWith(`${root}/`)) return refused;
    return Effect.succeed(`${next.pathname.slice(root.length + 1)}${next.search}`);
  } catch {
    return refused;
  }
}
