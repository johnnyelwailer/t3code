import type { ProjectSourceBinding } from "@t3tools/contracts";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import { accountSiteHost } from "~/t3team/t3team-accountSiteDisplay";

/** One Jira project the user can see, identified by site account AND external id (never key alone). */
export interface JiraCatalogProject {
  /** `accountId::externalProjectId`: unique across sites even when two sites reuse a project key. */
  readonly entryKey: string;
  readonly accountId: string;
  readonly provider: string;
  readonly externalProjectId: string;
  readonly key: string | undefined;
  readonly title: string;
  readonly iconUrl: string | undefined;
  readonly siteHost: string | null;
}

export const ATLASSIAN_ACCOUNTS_CACHE_KEY = "atlassian:listAccounts";

/** Same key the wizard writes, so the sidebar and the wizard share one cached list. */
export function atlassianProjectsCacheKey(account: Pick<IntegrationAccount, "provider" | "id">) {
  return `atlassian:listProjects:${account.provider}:${account.id}`;
}

export function jiraCatalogEntryKey(accountId: string, externalProjectId: string): string {
  return `${accountId}::${externalProjectId}`;
}

/** Flattens per-account project lists into one title-sorted catalog, first sighting wins. */
export function buildJiraCatalog(
  accounts: ReadonlyArray<IntegrationAccount>,
  projectsByAccountId: ReadonlyMap<string, ReadonlyArray<ExternalProject>>,
): ReadonlyArray<JiraCatalogProject> {
  const seen = new Set<string>();
  const entries: JiraCatalogProject[] = [];
  for (const account of accounts) {
    for (const project of projectsByAccountId.get(account.id) ?? []) {
      const entryKey = jiraCatalogEntryKey(account.id, project.id);
      if (seen.has(entryKey)) continue;
      seen.add(entryKey);
      entries.push({
        entryKey,
        accountId: account.id,
        provider: account.provider,
        externalProjectId: project.id,
        key: project.key,
        title: project.title,
        iconUrl: project.iconUrl,
        siteHost: accountSiteHost(account),
      });
    }
  }
  return entries.toSorted((a, b) => a.title.localeCompare(b.title));
}

/** Entry keys of the Jira projects an app project is already bound to. */
export function boundCatalogEntryKeys(
  appProjects: ReadonlyArray<{ readonly source?: ProjectSourceBinding | undefined }>,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const { source } of appProjects) {
    if (source && source.provider === "atlassian") {
      keys.add(jiraCatalogEntryKey(source.accountId, source.externalProjectId));
    }
  }
  return keys;
}

/** A connected Jira site whose project list could not be read. */
export interface JiraCatalogSiteFailure {
  readonly accountId: string;
  readonly provider: string;
  readonly siteHost: string | null;
  /** Host when we have one, otherwise the account label. */
  readonly label: string;
  readonly error: string;
}

function siteFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Could not load this Jira site";
}

/** The failure the pill row shows. The site stays named even when the fetch threw a non-Error. */
export function jiraCatalogSiteFailure(
  account: Pick<IntegrationAccount, "id" | "provider" | "label" | "accountUrl">,
  error: unknown,
): JiraCatalogSiteFailure {
  const siteHost = accountSiteHost(account);
  return {
    accountId: account.id,
    provider: account.provider,
    siteHost,
    label: siteHost ?? account.label,
    error: siteFailureMessage(error),
  };
}

/**
 * One site's projects. A failure keeps that site's cached list (or nothing) and is reported;
 * it never throws, so the other sites still load.
 */
export async function loadJiraCatalogAccount(input: {
  account: Pick<IntegrationAccount, "id" | "provider" | "label" | "accountUrl">;
  listProjects: () => Promise<ReadonlyArray<ExternalProject>>;
  cachedProjects: ReadonlyArray<ExternalProject> | null;
}): Promise<{
  readonly projects: ReadonlyArray<ExternalProject> | null;
  readonly failure: JiraCatalogSiteFailure | null;
}> {
  try {
    return { projects: await input.listProjects(), failure: null };
  } catch (error) {
    return {
      projects: input.cachedProjects,
      failure: jiraCatalogSiteFailure(input.account, error),
    };
  }
}

/** Jira projects the app does not have yet. */
export function unaddedCatalogProjects(
  catalog: ReadonlyArray<JiraCatalogProject>,
  boundKeys: ReadonlySet<string>,
): ReadonlyArray<JiraCatalogProject> {
  return catalog.filter((entry) => !boundKeys.has(entry.entryKey));
}
