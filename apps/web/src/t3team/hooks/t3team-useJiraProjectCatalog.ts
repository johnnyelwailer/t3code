import { useEffect, useState } from "react";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";

import { readIntegrationCache, writeIntegrationCache } from "./t3team-integrationCache";
import {
  ATLASSIAN_ACCOUNTS_CACHE_KEY,
  atlassianProjectsCacheKey,
  buildJiraCatalog,
  type JiraCatalogProject,
} from "./t3team-jiraProjectCatalog.logic";

const EMPTY_CATALOG: ReadonlyArray<JiraCatalogProject> = [];
/** A remount inside this window reuses the cached lists instead of asking Jira again. */
const LIVE_REFRESH_MIN_INTERVAL_MS = 5 * 60_000;

let lastLiveRefreshAt = 0;

export function readCachedJiraAccounts(): ReadonlyArray<IntegrationAccount> {
  return (
    readIntegrationCache<ReadonlyArray<IntegrationAccount>>(ATLASSIAN_ACCOUNTS_CACHE_KEY)?.value ??
    []
  );
}

export function readCachedCatalog(): ReadonlyArray<JiraCatalogProject> {
  const accounts = readCachedJiraAccounts();
  const byAccount = new Map<string, ReadonlyArray<ExternalProject>>();
  for (const account of accounts) {
    const cached = readIntegrationCache<ReadonlyArray<ExternalProject>>(
      atlassianProjectsCacheKey(account),
    )?.value;
    if (cached) byAccount.set(account.id, cached);
  }
  return buildJiraCatalog(accounts, byAccount);
}

/** The connected sites and every project on them; `accounts` is empty when Jira is not connected. */
export async function fetchLiveJiraCatalog(backend: BackendApi): Promise<{
  readonly accounts: ReadonlyArray<IntegrationAccount>;
  readonly catalog: ReadonlyArray<JiraCatalogProject>;
}> {
  const accounts = await backend.atlassian.listAccounts();
  writeIntegrationCache(ATLASSIAN_ACCOUNTS_CACHE_KEY, accounts);
  const byAccount = new Map<string, ReadonlyArray<ExternalProject>>();
  let lastFailure: unknown = null;
  let failures = 0;
  await Promise.all(
    accounts.map(async (account) => {
      try {
        const projects = await backend.atlassian.listProjects({
          id: account.id,
          provider: account.provider,
        });
        writeIntegrationCache(atlassianProjectsCacheKey(account), projects);
        byAccount.set(account.id, projects);
      } catch (error) {
        failures += 1;
        lastFailure = error;
        // One unreachable site must not hide the others; keep that site's cached list.
        const cached = readIntegrationCache<ReadonlyArray<ExternalProject>>(
          atlassianProjectsCacheKey(account),
        )?.value;
        if (cached) byAccount.set(account.id, cached);
      }
    }),
  );
  const catalog = buildJiraCatalog(accounts, byAccount);
  // Every site failing and nothing cached is "Jira is unreachable", not "there are no projects".
  if (accounts.length > 0 && failures === accounts.length && catalog.length === 0) {
    throw lastFailure instanceof Error ? lastFailure : new Error("Could not reach Jira.");
  }
  return { accounts, catalog };
}

async function fetchLiveCatalog(backend: BackendApi): Promise<ReadonlyArray<JiraCatalogProject>> {
  return (await fetchLiveJiraCatalog(backend)).catalog;
}

/**
 * Every Jira project of every connected site, whether or not the app has it yet. Cached lists
 * render immediately; a live read (throttled) then refreshes them. Failures are swallowed — the
 * catalog is an enhancement of the scope pills and must never break the sidebar.
 */
export function useJiraProjectCatalog(): ReadonlyArray<JiraCatalogProject> {
  const backend = useBackend();
  const [catalog, setCatalog] = useState<ReadonlyArray<JiraCatalogProject>>(() =>
    readCachedCatalog(),
  );

  useEffect(() => {
    if (!backend) return;
    if (Date.now() - lastLiveRefreshAt < LIVE_REFRESH_MIN_INTERVAL_MS) return;
    let cancelled = false;
    void fetchLiveCatalog(backend)
      .then((live) => {
        lastLiveRefreshAt = Date.now();
        if (!cancelled) setCatalog(live);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend]);

  return catalog.length === 0 ? EMPTY_CATALOG : catalog;
}
