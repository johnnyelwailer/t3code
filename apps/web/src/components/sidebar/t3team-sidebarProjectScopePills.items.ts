import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

/** One disc candidate: an app project, or a Jira project the app does not have yet. */
export type ScopePillItem =
  | { readonly kind: "app"; readonly projectKey: string; readonly group: SidebarProjectSnapshot }
  | {
      readonly kind: "add";
      readonly projectKey: string;
      readonly entry: JiraCatalogProject;
      readonly label: string;
    };

/** An add entry's name; the site host joins it only when more than one site is connected. */
function addEntryLabel(entry: JiraCatalogProject, multiSite: boolean): string {
  return multiSite && entry.siteHost ? `${entry.title} (${entry.siteHost})` : entry.title;
}

/**
 * App projects first, in the sidebar's own order, then the Jira projects that are not in the
 * app. An add item's key is namespaced so it can never equal an app project's scope key.
 */
export function buildScopePillItems(
  groups: ReadonlyArray<SidebarProjectSnapshot>,
  addable: ReadonlyArray<JiraCatalogProject>,
): ReadonlyArray<ScopePillItem> {
  const multiSite = new Set(addable.map((entry) => entry.siteHost)).size > 1;
  return [
    ...groups.map((group): ScopePillItem => ({ kind: "app", projectKey: group.projectKey, group })),
    ...addable.map((entry): ScopePillItem => ({
      kind: "add",
      projectKey: `jira-add:${entry.entryKey}`,
      entry,
      label: addEntryLabel(entry, multiSite),
    })),
  ];
}
