import type { IntegrationAccount } from "@t3tools/integrations-core";

/** `https://nexwork.atlassian.net/` → `nexwork.atlassian.net`; null when there is no usable URL. */
export function accountSiteHost(account: Pick<IntegrationAccount, "accountUrl">): string | null {
  const raw = account.accountUrl?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase() || null;
  } catch {
    return (
      raw
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .toLowerCase() || null
    );
  }
}

/**
 * One row per site. Two accounts for the same host are one site, so the later one is dropped;
 * accounts with no URL are never merged (nothing says they are the same), and an account id
 * seen twice is dropped too so React keys stay unique.
 */
export function dedupeAccountsBySite(
  accounts: ReadonlyArray<IntegrationAccount>,
): ReadonlyArray<IntegrationAccount> {
  const seenHosts = new Set<string>();
  const seenIds = new Set<string>();
  return accounts.filter((account) => {
    if (seenIds.has(account.id)) return false;
    const host = accountSiteHost(account);
    if (host !== null && seenHosts.has(host)) return false;
    seenIds.add(account.id);
    if (host !== null) seenHosts.add(host);
    return true;
  });
}
