import type { JiraApiAuth } from "@t3tools/integrations-atlassian";

function normalizeAtlassianSiteUrl(value: string): string | null {
  try {
    const trimmed = value.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}${
      url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")
    }`;
  } catch {
    return null;
  }
}

function authSiteUrl(auth: JiraApiAuth): string | undefined {
  if (auth.kind === "basic") {
    return auth.siteUrl;
  }
  return auth.siteUrl;
}

export function findAuthForAccountId(
  auths: ReadonlyMap<string, JiraApiAuth>,
  accountId: string,
): { readonly accountId: string; readonly auth: JiraApiAuth } | undefined {
  const exact = auths.get(accountId);
  if (exact) {
    return { accountId, auth: exact };
  }

  const normalizedAccountId = normalizeAtlassianSiteUrl(accountId);
  if (!normalizedAccountId) {
    return undefined;
  }

  for (const [storedAccountId, auth] of auths) {
    const storedAccountUrl = normalizeAtlassianSiteUrl(storedAccountId);
    const storedAuthUrl = authSiteUrl(auth) ? normalizeAtlassianSiteUrl(authSiteUrl(auth)!) : null;
    if (storedAccountUrl === normalizedAccountId || storedAuthUrl === normalizedAccountId) {
      return { accountId: storedAccountId, auth };
    }
  }
  return undefined;
}
