export const UPSTREAM_REMOTE_NAME = "upstream";
export const UPSTREAM_REPO_SLUG = "pingdotgg/t3code";
export const UPSTREAM_BASE_BRANCH = "main";
export const UPSTREAM_BASE_REF = `${UPSTREAM_REMOTE_NAME}/${UPSTREAM_BASE_BRANCH}`;

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
  return `git remote add ${UPSTREAM_REMOTE_NAME} https://github.com/${UPSTREAM_REPO_SLUG}.git`;
}
