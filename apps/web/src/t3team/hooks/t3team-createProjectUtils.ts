import type { IntegrationAccount } from "@t3tools/integrations-core";

const LAST_ACCOUNT_ID_STORAGE_KEY = "t3team:last-atlassian-account-id";

export function readConfiguredAtlassianSiteUrl(): string {
  return __ATLASSIAN_SITE_URL__.trim();
}

export function defaultAtlassianSiteUrlInput(): string {
  const configured = readConfiguredAtlassianSiteUrl();
  return configured ? normalizeAtlassianUrl(configured) : "https://";
}

export function isValidAtlassianUrl(value: string): boolean {
  try {
    const url = new URL(normalizeAtlassianUrl(value));
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeAtlassianUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function readLastAccountId(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistLastAccountId(accountId: string): void {
  try {
    localStorage.setItem(LAST_ACCOUNT_ID_STORAGE_KEY, accountId);
  } catch {
    // Ignore storage failures in private mode or blocked environments.
  }
}

/** Exported for the review step, which shows the connected site as a bare hostname. */
export function atlassianSiteHost(value: string): string | null {
  try {
    return new URL(normalizeAtlassianUrl(value)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function accountMatchesConfiguredSite(
  account: IntegrationAccount,
  configuredSiteUrl: string,
): boolean {
  if (!account.accountUrl) return false;
  const configuredHost = atlassianSiteHost(configuredSiteUrl);
  const accountHost = atlassianSiteHost(account.accountUrl);
  return configuredHost !== null && configuredHost === accountHost;
}

export function pickPreferredAccount(
  loadedAccounts: ReadonlyArray<IntegrationAccount>,
): IntegrationAccount | null {
  const configuredSiteUrl = readConfiguredAtlassianSiteUrl();
  if (configuredSiteUrl) {
    const configuredMatch = loadedAccounts.find((account) =>
      accountMatchesConfiguredSite(account, configuredSiteUrl),
    );
    if (configuredMatch) return configuredMatch;
  }

  const lastAccountId = readLastAccountId();
  if (!lastAccountId) return loadedAccounts[0] ?? null;
  return (
    loadedAccounts.find((account) => account.id === lastAccountId) ?? loadedAccounts[0] ?? null
  );
}
