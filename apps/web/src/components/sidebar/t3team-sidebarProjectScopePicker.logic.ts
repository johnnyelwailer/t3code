import type { ScopePillItem } from "./t3team-sidebarProjectScopePills.items";

/** One row of the scope picker. `value`/`label` are the Combobox contract; "all" clears the scope. */
export type ScopePickerEntry =
  | { readonly kind: "all"; readonly value: "all"; readonly label: string }
  | {
      readonly kind: "item";
      readonly value: string;
      readonly label: string;
      readonly item: ScopePillItem;
    };

function itemEntry(item: ScopePillItem): ScopePickerEntry {
  return {
    kind: "item",
    value: item.projectKey,
    label: item.kind === "app" ? item.group.displayName : item.label,
    item,
  };
}

/**
 * Every scope the row knows, not just the ones behind +N: the overflow first (what the reader
 * cannot see), then the discs already shown, then "All projects". Search narrows this one list.
 */
export function buildScopePickerEntries(
  shown: ReadonlyArray<ScopePillItem>,
  overflow: ReadonlyArray<ScopePillItem>,
): ReadonlyArray<ScopePickerEntry> {
  return [
    ...overflow.map(itemEntry),
    ...shown.map(itemEntry),
    { kind: "all", value: "all", label: "All projects" },
  ];
}

/** The picker disc's accessible name: it counts what is hidden, and always says it searches. */
export function scopePickerLabel(overflowCount: number): string {
  if (overflowCount === 0) return "Search projects";
  return `${overflowCount} more ${overflowCount === 1 ? "project" : "projects"}, search projects`;
}
