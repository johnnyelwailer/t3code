import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

/** One row of the scope picker. `value`/`label` are the Combobox contract; "all" clears the scope. */
export type ScopePickerEntry =
  | { readonly kind: "all"; readonly value: "all"; readonly label: string }
  | {
      readonly kind: "app";
      readonly value: string;
      readonly label: string;
      readonly group: SidebarProjectSnapshot;
    }
  | {
      readonly kind: "add";
      readonly value: string;
      readonly label: string;
      readonly entry: JiraCatalogProject;
    };

/** An add entry's name; the site host joins it only when more than one site is connected. */
function addEntryLabel(entry: JiraCatalogProject, multiSite: boolean): string {
  return multiSite && entry.siteHost ? `${entry.title} (${entry.siteHost})` : entry.title;
}

/**
 * Every scope the row knows, not just the ones behind +N: the overflow first (what the reader
 * cannot see), then the discs already shown, then the Jira projects the app does not have yet,
 * then "All projects". Search narrows this one list.
 */
export function buildScopePickerEntries(
  shown: ReadonlyArray<SidebarProjectSnapshot>,
  overflow: ReadonlyArray<SidebarProjectSnapshot>,
  addable: ReadonlyArray<JiraCatalogProject>,
): ReadonlyArray<ScopePickerEntry> {
  const appEntry = (group: SidebarProjectSnapshot): ScopePickerEntry => ({
    kind: "app",
    value: group.projectKey,
    label: group.displayName,
    group,
  });
  const multiSite = new Set(addable.map((entry) => entry.siteHost)).size > 1;
  return [
    ...overflow.map(appEntry),
    ...shown.map(appEntry),
    ...addable.map((entry): ScopePickerEntry => ({
      kind: "add",
      value: `jira-add:${entry.entryKey}`,
      label: addEntryLabel(entry, multiSite),
      entry,
    })),
    { kind: "all", value: "all", label: "All projects" },
  ];
}

/**
 * What the picker lists for a query. Without a query the row shows the scopes it already has;
 * the Jira projects the app does not have yet surface only as search candidates.
 */
export function visibleScopePickerEntries(
  entries: ReadonlyArray<ScopePickerEntry>,
  query: string,
): ReadonlyArray<ScopePickerEntry> {
  if (query.trim().length === 0) return entries.filter((entry) => entry.kind !== "add");
  return entries;
}

/** The picker disc's accessible name: it counts what is hidden, and always says it searches. */
export function scopePickerLabel(overflowCount: number): string {
  if (overflowCount === 0) return "Search projects";
  return `${overflowCount} more ${overflowCount === 1 ? "project" : "projects"}, search projects`;
}
