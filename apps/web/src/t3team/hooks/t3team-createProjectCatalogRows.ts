import type { ProjectSourceBinding } from "@t3tools/contracts";

import {
  jiraCatalogEntryKey,
  type JiraCatalogProject,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

/** One catalog project, plus the app project already bound to it (when there is one). */
export type CatalogRow = {
  readonly entry: JiraCatalogProject;
  readonly existingProjectId: string | null;
};

export type CatalogRows = {
  readonly available: ReadonlyArray<CatalogRow>;
  readonly added: ReadonlyArray<CatalogRow>;
};

/** App project id per Jira catalog entry key, for every project bound to a Jira project. */
export function mapBoundProjectIds(
  appProjects: ReadonlyArray<{
    readonly id: string;
    readonly source?: ProjectSourceBinding | undefined;
  }>,
): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  for (const { id, source } of appProjects) {
    if (source && source.provider === "atlassian") {
      ids.set(jiraCatalogEntryKey(source.accountId, source.externalProjectId), id);
    }
  }
  return ids;
}

function matches(entry: JiraCatalogProject, tokens: ReadonlyArray<string>): boolean {
  if (tokens.length === 0) return true;
  const haystack = `${entry.title} ${entry.key ?? ""} ${entry.siteHost ?? ""}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Splits the catalog into "can be added" and "already added", filtered by one free-text query
 * (every word must match title, key or site). Order is the catalog's own (title-sorted).
 */
export function buildCatalogRows(
  catalog: ReadonlyArray<JiraCatalogProject>,
  boundProjectIds: ReadonlyMap<string, string>,
  query: string,
): CatalogRows {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const available: CatalogRow[] = [];
  const added: CatalogRow[] = [];
  for (const entry of catalog) {
    if (!matches(entry, tokens)) continue;
    const existingProjectId = boundProjectIds.get(entry.entryKey) ?? null;
    (existingProjectId === null ? available : added).push({ entry, existingProjectId });
  }
  return { available, added };
}

/** True when the catalog spans more than one Jira site, i.e. a row must say which site it is on. */
export function spansMultipleSites(catalog: ReadonlyArray<JiraCatalogProject>): boolean {
  return new Set(catalog.map((entry) => entry.siteHost ?? entry.accountId)).size > 1;
}
