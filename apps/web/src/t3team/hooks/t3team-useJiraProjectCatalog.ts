import { useCallback, useEffect, useState } from "react";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import { useBackend } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";

import { readIntegrationCache, writeIntegrationCache } from "./t3team-integrationCache";
import {
  ATLASSIAN_ACCOUNTS_CACHE_KEY,
  atlassianProjectsCacheKey,
  buildJiraCatalog,
  loadJiraCatalogAccount,
  type JiraCatalogProject,
  type JiraCatalogSiteFailure,
} from "./t3team-jiraProjectCatalog.logic";

const EMPTY_CATALOG: ReadonlyArray<JiraCatalogProject> = [];
const EMPTY_FAILURES: ReadonlyArray<JiraCatalogSiteFailure> = [];
/** A remount inside this window reuses the cached lists instead of asking Jira again. */
const LIVE_REFRESH_MIN_INTERVAL_MS = 5 * 60_000;

let lastLiveRefreshAt = 0;

/** Tests start from a cold catalog. A live refresh inside the interval would otherwise skip. */
export function resetJiraCatalogLiveRefreshForTests(): void {
  lastLiveRefreshAt = 0;
}

export interface JiraProjectCatalog {
  readonly projects: ReadonlyArray<JiraCatalogProject>;
  readonly siteFailures: ReadonlyArray<JiraCatalogSiteFailure>;
  /** Re-reads one site. Does not wait out the catalog-wide refresh interval. */
  readonly retrySite: (accountId: string) => void;
}

function readCachedProjects(
  account: Pick<IntegrationAccount, "provider" | "id">,
): ReadonlyArray<ExternalProject> | null {
  return (
    readIntegrationCache<ReadonlyArray<ExternalProject>>(atlassianProjectsCacheKey(account))
      ?.value ?? null
  );
}

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
    const cached = readCachedProjects(account);
    if (cached) byAccount.set(account.id, cached);
  }
  return buildJiraCatalog(accounts, byAccount);
}

async function fetchLiveCatalog(backend: BackendApi): Promise<{
  readonly catalog: ReadonlyArray<JiraCatalogProject>;
  readonly siteFailures: ReadonlyArray<JiraCatalogSiteFailure>;
}> {
  const accounts = await backend.atlassian.listAccounts();
  writeIntegrationCache(ATLASSIAN_ACCOUNTS_CACHE_KEY, accounts);
  const byAccount = new Map<string, ReadonlyArray<ExternalProject>>();
  const siteFailures: JiraCatalogSiteFailure[] = [];
  await Promise.all(
    accounts.map(async (account) => {
      const result = await loadJiraCatalogAccount({
        account,
        cachedProjects: readCachedProjects(account),
        listProjects: () =>
          backend.atlassian.listProjects({ id: account.id, provider: account.provider }),
      });
      if (result.projects) {
        writeIntegrationCache(atlassianProjectsCacheKey(account), result.projects);
        byAccount.set(account.id, result.projects);
      }
      if (result.failure) siteFailures.push(result.failure);
    }),
  );
  return { catalog: buildJiraCatalog(accounts, byAccount), siteFailures };
}

/** The connected sites and every project on them; `accounts` is empty when Jira is not connected. */
export async function fetchLiveJiraCatalog(backend: BackendApi): Promise<{
  readonly accounts: ReadonlyArray<IntegrationAccount>;
  readonly catalog: ReadonlyArray<JiraCatalogProject>;
}> {
  const { catalog, siteFailures } = await fetchLiveCatalog(backend);
  const accounts = readCachedJiraAccounts();
  // Every site failing and nothing cached is "Jira is unreachable", not "there are no projects".
  if (accounts.length > 0 && siteFailures.length === accounts.length && catalog.length === 0) {
    throw new Error(siteFailures[0]?.error ?? "Could not reach Jira.");
  }
  return { accounts, catalog };
}

/**
 * Every Jira project of every connected site, whether or not the app has it yet. Cached lists
 * render immediately; a live read (throttled) then refreshes them. One site failing is reported
 * on `siteFailures` and does not drop the others.
 */
export function useJiraProjectCatalog(): JiraProjectCatalog {
  const backend = useBackend();
  const [catalog, setCatalog] = useState<ReadonlyArray<JiraCatalogProject>>(() =>
    readCachedCatalog(),
  );
  const [siteFailures, setSiteFailures] =
    useState<ReadonlyArray<JiraCatalogSiteFailure>>(EMPTY_FAILURES);

  useEffect(() => {
    if (!backend) return;
    if (Date.now() - lastLiveRefreshAt < LIVE_REFRESH_MIN_INTERVAL_MS) return;
    let cancelled = false;
    void fetchLiveCatalog(backend)
      .then((live) => {
        lastLiveRefreshAt = Date.now();
        if (cancelled) return;
        setCatalog(live.catalog);
        setSiteFailures(live.siteFailures);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const retrySite = useCallback(
    (accountId: string) => {
      if (!backend) return;
      const account = readCachedJiraAccounts().find((entry) => entry.id === accountId);
      if (!account) return;
      void loadJiraCatalogAccount({
        account,
        cachedProjects: readCachedProjects(account),
        listProjects: () =>
          backend.atlassian.listProjects({ id: account.id, provider: account.provider }),
      }).then((result) => {
        if (result.failure === null && result.projects) {
          writeIntegrationCache(atlassianProjectsCacheKey(account), result.projects);
        }
        setCatalog(readCachedCatalog());
        setSiteFailures((current) =>
          result.failure
            ? [...current.filter((failure) => failure.accountId !== accountId), result.failure]
            : current.filter((failure) => failure.accountId !== accountId),
        );
      });
    },
    [backend],
  );

  return {
    projects: catalog.length === 0 ? EMPTY_CATALOG : catalog,
    siteFailures,
    retrySite,
  };
}
