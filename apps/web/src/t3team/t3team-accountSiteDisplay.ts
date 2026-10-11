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
