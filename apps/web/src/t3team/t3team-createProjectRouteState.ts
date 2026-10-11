import { jiraCatalogEntryKey } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

/**
 * Where the "Add a Jira project" flow is in the URL.
 *
 * `/t3team/new` is the first screen (choose a project). `/t3team/new?project=<accountId>::<id>` is
 * the second (set it up). The step lives in the URL so Back/Forward, refresh and deep links all land
 * on the same screen — the project is named by site account AND external id, never by key alone,
 * which is exactly how the Jira catalog identifies it (`jiraCatalogEntryKey`).
 */
const CREATE_PROJECT_SEARCH_KEY = "project";
const ENTRY_KEY_SEPARATOR = "::";

export type CreateProjectRouteSearch = { project?: string };

export type CreateProjectEntryRef = {
  readonly accountId: string;
  readonly externalProjectId: string;
};

export function parseCreateProjectEntryKey(entryKey: string): CreateProjectEntryRef | null {
  const separatorAt = entryKey.indexOf(ENTRY_KEY_SEPARATOR);
  if (separatorAt <= 0) return null;
  const accountId = entryKey.slice(0, separatorAt);
  const externalProjectId = entryKey.slice(separatorAt + ENTRY_KEY_SEPARATOR.length);
  return externalProjectId.length > 0 ? { accountId, externalProjectId } : null;
}

export function parseCreateProjectRouteSearch(
  search: Record<string, unknown>,
): CreateProjectRouteSearch {
  const raw = search[CREATE_PROJECT_SEARCH_KEY];
  return typeof raw === "string" && parseCreateProjectEntryKey(raw) ? { project: raw } : {};
}

export function createProjectSearchFor(entry: CreateProjectEntryRef): { project: string } {
  return { project: jiraCatalogEntryKey(entry.accountId, entry.externalProjectId) };
}
