import { SearchIcon } from "lucide-react";
import {
  useMemo,
  useReducer,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import {
  filterSidebarProjectScopeItems,
  reduceSidebarProjectScopeMenuState,
} from "../Sidebar.logic";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
  useComboboxFilter,
} from "../ui/combobox";
import { T3TeamSidebarProjectScopePickerItem } from "./t3team-SidebarProjectScopePickerItem";
import { addJiraProject } from "./t3team-sidebarProjectScopePills.actions";
import type { ScopePillItem } from "./t3team-sidebarProjectScopePills.items";
import { SCOPE_DISC_OVERLAP } from "./t3team-sidebarProjectScopePills.logic";
import {
  buildScopePickerEntries,
  scopePickerLabel,
  type ScopePickerEntry,
} from "./t3team-sidebarProjectScopePicker.logic";

type ProjectContextMenu = (
  event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
  projectGroup: SidebarProjectSnapshot,
) => void;

/**
 * The last disc of the scope row: "+N" while projects overflow, a search glyph otherwise. Either
 * way it opens one searchable list of every project, the header picker's filtering and keys.
 */
export function T3TeamSidebarProjectScopePicker({
  shown,
  overflow,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
  anchor,
  zIndex,
}: {
  shown: ReadonlyArray<ScopePillItem>;
  overflow: ReadonlyArray<ScopePillItem>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
  onProjectContextMenu?: ProjectContextMenu | undefined;
  /** The popup opens under this element (the whole pill row), not the 28px disc. */
  anchor?: RefObject<HTMLElement | null> | undefined;
  zIndex: number;
}) {
  const [menu, dispatch] = useReducer(reduceSidebarProjectScopeMenuState, {
    open: false,
    query: "",
  });
  const filter = useComboboxFilter();
  const entries = useMemo(() => buildScopePickerEntries(shown, overflow), [shown, overflow]);
  const filtered = useMemo(
    () =>
      filterSidebarProjectScopeItems({
        items: entries,
        query: menu.query,
        matches: (entry, query) => filter.contains(entry, query, (candidate) => candidate.label),
      }),
    [entries, filter, menu.query],
  );
  const selected: ScopePickerEntry =
    entries.find((entry) => entry.value === (activeScopeKey ?? "all")) ?? entries.at(-1)!;
  // Items use virtual focus, so the context-menu key arrives on the input, not the option.
  const highlightedRef = useRef<ScopePickerEntry | null>(null);

  const openSettings = (
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
    entry: ScopePickerEntry | null,
  ) => {
    if (!onProjectContextMenu || entry?.kind !== "item" || entry.item.kind !== "app") return;
    onProjectContextMenu(event, entry.item.group);
    dispatch({ type: "project-settings-opened" });
  };

  return (
    <Combobox<ScopePickerEntry>
      items={entries}
      filteredItems={filtered}
      autoHighlight
      itemToStringLabel={(entry) => entry.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={menu.open}
      onOpenChange={(open) => dispatch({ type: "open-changed", open })}
      onItemHighlighted={(entry) => {
        highlightedRef.current = entry ?? null;
      }}
      value={selected}
      onValueChange={(entry) => {
        if (!entry) return;
        if (entry.kind === "all") onSelectScope(null);
        else if (entry.item.kind === "app") onSelectScope(entry.item.projectKey);
        else addJiraProject(entry.item.entry);
      }}
    >
      <ComboboxTrigger
        render={
          <button
            type="button"
            aria-label={scopePickerLabel(overflow.length)}
            style={{ zIndex, marginLeft: -SCOPE_DISC_OVERLAP }}
            className="relative inline-flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/15 bg-card px-1.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 dark:border-white/15 dark:bg-sidebar-control-surface"
          />
        }
      >
        {overflow.length > 0 ? (
          `+${overflow.length}`
        ) : (
          <SearchIcon aria-hidden="true" className="size-3.5" />
        )}
      </ComboboxTrigger>
      <ComboboxPopup
        align="start"
        anchor={anchor}
        className="max-w-[min(18rem,var(--available-width))] overflow-hidden"
      >
        <ComboboxSearchInput
          aria-label="Search projects"
          placeholder="Search projects..."
          value={menu.query}
          onChange={(event) => dispatch({ type: "query-changed", query: event.target.value })}
          onKeyDown={(event) => {
            const contextKey =
              event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
            if (event.defaultPrevented || event.nativeEvent.isComposing || !contextKey) return;
            if (event.ctrlKey || event.altKey || event.metaKey) return;
            // A row filtered out since it was highlighted is not the one on screen.
            const highlighted = highlightedRef.current;
            if (highlighted && filtered.includes(highlighted)) openSettings(event, highlighted);
          }}
        />
        <ComboboxEmpty>No matching projects.</ComboboxEmpty>
        <ComboboxList>
          {(entry: ScopePickerEntry) => (
            <T3TeamSidebarProjectScopePickerItem
              key={entry.value}
              entry={entry}
              onContextMenu={(event) => openSettings(event, entry)}
            />
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
