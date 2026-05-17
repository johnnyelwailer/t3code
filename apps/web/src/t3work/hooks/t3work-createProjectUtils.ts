import type { IntegrationAccount } from "@t3tools/integrations-core";

const LAST_ACCOUNT_ID_STORAGE_KEY = "t3work:last-atlassian-account-id";

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

export function pickPreferredAccount(
  loadedAccounts: ReadonlyArray<IntegrationAccount>,
): IntegrationAccount | null {
  const lastAccountId = readLastAccountId();
  if (!lastAccountId) return loadedAccounts[0] ?? null;
  return (
    loadedAccounts.find((account) => account.id === lastAccountId) ?? loadedAccounts[0] ?? null
  );
}
