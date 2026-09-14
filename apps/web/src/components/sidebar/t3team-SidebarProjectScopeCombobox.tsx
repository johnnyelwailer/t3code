import { ChevronDownIcon, EllipsisIcon, FolderIcon, SearchIcon } from "lucide-react";
import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { ProjectFavicon } from "../ProjectFavicon";
import {
  filterSidebarProjectScopeItems,
  reduceSidebarProjectScopeMenuState,
} from "../Sidebar.logic";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
  useComboboxFilter,
} from "../ui/combobox";
import { SidebarMenuButton } from "../ui/sidebar";
import {
  T3TeamSidebarProjectScopeComboboxItem,
  type SidebarProjectScopeItem,
} from "./t3team-SidebarProjectScopeComboboxItem";

const ALL_PROJECTS_ITEM: SidebarProjectScopeItem = { value: "all", label: "All projects" };

/**
 * The sidebar's project scope menu — a searchable combobox over the project groups, with a
 * per-project settings shortcut (button, context menu, Shift+F10 / ContextMenu key on the
 * search input). Extracted from upstream `Sidebar.tsx` so the pill row story and the app
 * render the one implementation. `compact` renders the trigger as an icon-only "more"
 * button beside the pills; otherwise it is the full-width "All projects ▾" trigger.
 */
export function T3TeamSidebarProjectScopeCombobox({
  projectGroups,
  scopeKey,
  onScopeKeyChange,
  onOpenProjectSettings,
  compact = false,
}: {
  projectGroups: ReadonlyArray<SidebarProjectSnapshot>;
  scopeKey: string | null;
  onScopeKeyChange: (scopeKey: string | null) => void;
  onOpenProjectSettings: (projectGroup: SidebarProjectSnapshot) => void;
  compact?: boolean;
}) {
  // {value, label} items let Base UI drive the combobox selection contract while the popup
  // search filters the same collection.
  const items = useMemo(
    () => [
      ALL_PROJECTS_ITEM,
      ...projectGroups.map((project) => ({
        value: project.projectKey,
        label: project.displayName,
      })),
    ],
    [projectGroups],
  );
  const groupByScopeKey = useMemo(
    () => new Map(projectGroups.map((project) => [project.projectKey, project] as const)),
    [projectGroups],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.value === (scopeKey ?? "all")) ?? items[0]!,
    [items, scopeKey],
  );
  const scopedGroup = scopeKey === null ? null : (groupByScopeKey.get(scopeKey) ?? null);
  const [menuState, dispatchMenu] = useReducer(reduceSidebarProjectScopeMenuState, {
    open: false,
    query: "",
  });
  const filter = useComboboxFilter();
  // Filtering derives from the same React state that controls the input, so the visible query
  // and the visible list can never desync. "All projects" is a scope reset, not a searchable
  // entry: it only shows while a scope is active and the query is empty.
  const filteredItems = useMemo(
    () =>
      filterSidebarProjectScopeItems({
        items,
        activeScopeKey: scopeKey,
        query: menuState.query,
        matches: (item, query) => filter.contains(item, query, (candidate) => candidate.label),
      }),
    [filter, items, menuState.query, scopeKey],
  );
  // Safari can send a click after Ctrl+click opens settings. Ignore that one selection, then
  // clear the guard when the picker opens again.
  const suppressNextChangeRef = useRef(false);
  const highlightedKeyRef = useRef<string | null>(null);
  const handleProjectSettings = useCallback(
    (
      event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
      projectGroup: SidebarProjectSnapshot,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      suppressNextChangeRef.current = true;
      dispatchMenu({ type: "project-settings-opened" });
      onOpenProjectSettings(projectGroup);
    },
    [onOpenProjectSettings],
  );

  return (
    <Combobox
      items={items}
      filteredItems={filteredItems}
      autoHighlight
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={menuState.open}
      onOpenChange={(open) => {
        if (open) suppressNextChangeRef.current = false;
        dispatchMenu({ type: "open-changed", open });
      }}
      onItemHighlighted={(item) => {
        highlightedKeyRef.current = item?.value ?? null;
      }}
      value={selectedItem}
      onValueChange={(item) => {
        if (suppressNextChangeRef.current) {
          suppressNextChangeRef.current = false;
          return;
        }
        if (!item) return;
        onScopeKeyChange(item.value === "all" ? null : item.value);
      }}
    >
      {compact ? (
        <ComboboxTrigger
          render={
            <SidebarMenuButton
              size="icon"
              aria-label="More projects"
              title="More projects"
              className="shrink-0 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            />
          }
        >
          <EllipsisIcon className="size-4 shrink-0" />
        </ComboboxTrigger>
      ) : (
        <ComboboxTrigger
          render={
            <SidebarMenuButton
              aria-label="Filter threads by project"
              className="min-w-0 flex-1 ps-[calc(var(--sidebar-row-content-inset)-1px)] focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            />
          }
        >
          {scopedGroup ? (
            <span className="flex shrink-0">
              <ProjectFavicon
                environmentId={scopedGroup.environmentId}
                cwd={scopedGroup.workspaceRoot}
                projectName={scopedGroup.title}
                faviconPath={scopedGroup.faviconPath}
                projectIcon={scopedGroup.projectIcon}
                className="size-4"
              />
            </span>
          ) : (
            <FolderIcon className="size-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {scopedGroup?.displayName ?? "All projects"}
          </span>
          <ChevronDownIcon className="-mr-px size-4 shrink-0" />
        </ComboboxTrigger>
      )}
      <ComboboxPopup
        align="start"
        className={
          compact ? "w-64 min-w-0 overflow-hidden" : "w-(--anchor-width) min-w-0 overflow-hidden"
        }
      >
        <div className="shrink-0 px-3 pt-2.5">
          <div className="relative -translate-y-px border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1.5 left-0 size-4 shrink-0 text-muted-foreground/55"
            />
            <ComboboxInput
              aria-label="Search projects"
              className="[&_input]:h-6.5 [&_input]:ps-5 [&_input]:font-sans [&_input]:leading-6.5"
              inputClassName="rounded-none bg-transparent text-sm"
              placeholder="Search projects..."
              showTrigger={false}
              size="sm"
              unstyled
              value={menuState.query}
              onKeyDown={(event) => {
                if (
                  event.defaultPrevented ||
                  event.nativeEvent.isComposing ||
                  event.ctrlKey ||
                  event.altKey ||
                  event.metaKey ||
                  (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
                ) {
                  return;
                }
                // Combobox items use virtual focus: keyboard events stay on this input.
                const key = highlightedKeyRef.current;
                const project = key ? groupByScopeKey.get(key) : null;
                if (project) handleProjectSettings(event, project);
              }}
              onChange={(event) =>
                dispatchMenu({ type: "query-changed", query: event.target.value })
              }
            />
          </div>
        </div>
        <ComboboxEmpty>No matching projects.</ComboboxEmpty>
        <ComboboxList>
          {(item: SidebarProjectScopeItem) => (
            <T3TeamSidebarProjectScopeComboboxItem
              key={item.value}
              item={item}
              project={groupByScopeKey.get(item.value) ?? null}
              onProjectSettings={handleProjectSettings}
            />
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
