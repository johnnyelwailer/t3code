export const UPSTREAM_REMOTE_NAME = "upstream";
export const UPSTREAM_REPO_SLUG = "pingdotgg/t3code";
export const UPSTREAM_BASE_BRANCH = "main";
export const UPSTREAM_BASE_REF = `${UPSTREAM_REMOTE_NAME}/${UPSTREAM_BASE_BRANCH}`;

/**
 * The canonical upstream URL. This never changes, so nothing should ever ask a
 * human to type it — tooling that needs the remote configures it from here.
 */
export const UPSTREAM_REMOTE_URL = `https://github.com/${UPSTREAM_REPO_SLUG}.git`;

/**
 * Deliberately unpushable push URL for the upstream remote.
 *
 * AGENTS.md's hard rule is that we NEVER push or open PRs against upstream.
 * Since tooling now adds this remote automatically, the remote existing must
 * not quietly create a way to push to it — so its push URL is pointed at this
 * sentinel, and `git push upstream` fails loudly instead of reaching
 * `pingdotgg`. Fetch still works, which is all the guard needs.
 */
export const UPSTREAM_REMOTE_PUSH_DISABLED =
  "DISABLED-never-push-to-upstream-see-AGENTS.md";

function stripDotGitSuffix(value) {
  return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function extractSlugFromGitSshUrl(url) {
  const match = /^.+@[^:]+:(.+)$/.exec(url);
  if (!match?.[1]) return null;
  return stripDotGitSuffix(match[1]).replace(/^\/+/, "");
}

function extractSlugFromStandardUrl(url) {
  try {
    const parsed = new URL(url);
    return stripDotGitSuffix(parsed.pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
}

export function extractRepoSlugFromRemoteUrl(remoteUrl) {
  const trimmed = remoteUrl.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.includes("@") && trimmed.includes(":")) {
    return extractSlugFromGitSshUrl(trimmed);
  }

  return extractSlugFromStandardUrl(trimmed);
}

export function isExpectedUpstreamRemoteUrl(remoteUrl) {
  const slug = extractRepoSlugFromRemoteUrl(remoteUrl);
  if (!slug) return false;
  return slug.toLowerCase() === UPSTREAM_REPO_SLUG;
}

export function expectedUpstreamRemoteHint() {
  return `git remote add ${UPSTREAM_REMOTE_NAME} ${UPSTREAM_REMOTE_URL}`;
}
