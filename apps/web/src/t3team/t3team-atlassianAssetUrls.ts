import { resolvePrimaryEnvironmentHttpUrl } from "~/environments/primary/target";

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
  const baseUrl = input.httpBaseUrl ?? primaryHttpBaseUrl();
  return baseUrl ? new URL(path, baseUrl).toString() : path;
}

/**
 * The packaged desktop app serves its UI from the `t3code://` scheme with no backend behind it, so
 * a relative `/api/...` image URL resolves to the SPA's index.html and every proxied icon breaks.
 * Anchor it on the primary environment instead. Undefined (relative path) only when there is no
 * primary to resolve, e.g. outside a browser.
 */
function primaryHttpBaseUrl(): string | undefined {
  // On desktop the resolve is a synchronous IPC round-trip and a long list calls this once per
  // icon/avatar: share one answer per tick. The bootstrap can change mid-session (WSL settings),
  // so it is never held longer than that.
  if (cachedPrimaryHttpBaseUrl === null) {
    try {
      cachedPrimaryHttpBaseUrl = resolvePrimaryEnvironmentHttpUrl("/");
    } catch {
      cachedPrimaryHttpBaseUrl = undefined;
    }
    queueMicrotask(() => {
      cachedPrimaryHttpBaseUrl = null;
    });
  }
  return cachedPrimaryHttpBaseUrl;
}

/** `null` = not resolved this tick. */
let cachedPrimaryHttpBaseUrl: string | undefined | null = null;

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
  if (url.startsWith("data:")) return url;
  if (url.includes(ASSET_PROXY_PATH)) {
    const baseUrl = url.startsWith("/") ? (httpBaseUrl ?? primaryHttpBaseUrl()) : undefined;
    return baseUrl ? new URL(url, baseUrl).toString() : url;
  }

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
