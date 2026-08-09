export function buildAtlassianAssetContentUrl(input: {
  accountId: string;
  url: string;
  httpBaseUrl?: string;
  workspaceRoot?: string;
  relativePath?: string;
}): string {
  const params = new URLSearchParams({
    accountId: input.accountId,
    url: input.url,
  });

  if (input.workspaceRoot) {
    params.set("workspaceRoot", input.workspaceRoot);
  }
  if (input.relativePath) {
    params.set("relativePath", input.relativePath);
  }

  const path = `/api/t3team/atlassian/asset/content?${params.toString()}`;
  return input.httpBaseUrl ? new URL(path, input.httpBaseUrl).toString() : path;
}

const ASSET_PROXY_PATH = "/api/t3team/atlassian/asset/content";

/**
 * Rewrites a Jira/Atlassian asset URL (person avatar, issue-type icon, ...) to the authenticated
 * server-side proxy, so the browser never issues a direct cross-origin request to
 * `secure.gravatar.com` / `api.atlassian.com`. Those requests hang pending without the caller's
 * Jira session and never resolve — leaving neither the image nor its `onError` fallback to fire.
 *
 * A no-op when there is nothing useful to rewrite: no connection `accountId` in scope yet, an
 * already-proxied URL (avoids double-wrapping when a value has passed through this twice), a
 * `data:` URI, or anything that isn't a parseable absolute http(s) URL.
 */
export function proxyAtlassianAssetUrl(input: {
  url: string | undefined;
  accountId: string | undefined;
  httpBaseUrl?: string;
}): string | undefined {
  const { url, accountId, httpBaseUrl } = input;
  if (!url || !accountId) return url;
  if (url.startsWith("data:") || url.includes(ASSET_PROXY_PATH)) return url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
  } catch {
    return url;
  }

  return buildAtlassianAssetContentUrl({
    accountId,
    url,
    ...(httpBaseUrl ? { httpBaseUrl } : {}),
  });
}
