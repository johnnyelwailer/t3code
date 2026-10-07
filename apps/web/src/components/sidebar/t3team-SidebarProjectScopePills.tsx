import { FolderIcon } from "lucide-react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import { useProjects } from "~/state/entities";
import {
  boundCatalogEntryKeys,
  unaddedCatalogProjects,
  type JiraCatalogProject,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import { useJiraProjectCatalog } from "~/t3team/hooks/t3team-useJiraProjectCatalog";
import { requestT3TeamCreateProject } from "~/t3team/t3team-createProjectRequest";

import { ProjectFavicon } from "../ProjectFavicon";
import { TooltipProvider } from "../ui/tooltip";
import { T3TeamSidebarProjectScopeDisc } from "./t3team-SidebarProjectScopeDisc";
import { JiraProjectGlyph } from "./t3team-SidebarProjectScopeJiraGlyph";
import {
  T3TeamSidebarProjectScopeOverflow,
  type ScopeOverflowEntry,
} from "./t3team-SidebarProjectScopeOverflow";
import { buildScopePillItems, type ScopePillItem } from "./t3team-sidebarProjectScopePills.items";
import {
  ADD_PILL_CLICK_BEHAVIOR,
  projectScopeDiscCapacity,
  projectScopeDiscDepth,
  splitProjectScopePills,
} from "./t3team-sidebarProjectScopePills.logic";

const ADD_DISABLED_REASON = "Not in the app yet. Add it from the Add project menu.";
const addDisabledReason = ADD_PILL_CLICK_BEHAVIOR === "disabled" ? ADD_DISABLED_REASON : undefined;

function addJiraProject(entry: JiraCatalogProject) {
  requestT3TeamCreateProject({
    accountId: entry.accountId,
    externalProjectId: entry.externalProjectId,
  });
}

/** Observed content width of the row, so the disc count follows the sidebar width. */
function useMeasuredWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Same props as the thread rows pass, so a disc shows exactly the icon its threads show
// (favicon, chosen icon, or the automatic per-project fallback).
function GroupIcon({ group }: { group: SidebarProjectSnapshot }) {
  return <ProjectFavicon project={group} className="size-4 shrink-0" />;
}

type PillsProps = {
  groups: ReadonlyArray<SidebarProjectSnapshot>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
  onProjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
    projectGroup: SidebarProjectSnapshot,
  ) => void;
};

/**
 * Pills plus the user's Jira projects the app does not have yet. The catalog and the app's
 * own bindings are read here, so the sidebar passes the same props as before.
 */
export function T3TeamSidebarProjectScopePills(props: PillsProps) {
  const catalog = useJiraProjectCatalog();
  const appProjects = useProjects();
  const addable = useMemo(
    () => unaddedCatalogProjects(catalog, boundCatalogEntryKeys(appProjects)),
    [catalog, appProjects],
  );
  return <T3TeamSidebarProjectScopePillsView {...props} addable={addable} />;
}

function overflowEntry(item: ScopePillItem, onSelectScope: PillsProps["onSelectScope"]) {
  return item.kind === "app"
    ? ({
        key: item.projectKey,
        label: item.group.displayName,
        kind: "app",
        icon: <GroupIcon group={item.group} />,
        onSelect: () => onSelectScope(item.projectKey),
      } satisfies ScopeOverflowEntry)
    : ({
        key: item.projectKey,
        label: item.label,
        kind: "add",
        icon: <JiraProjectGlyph entry={item.entry} />,
        disabledReason: addDisabledReason,
        onSelect: () => addJiraProject(item.entry),
      } satisfies ScopeOverflowEntry);
}

/**
 * One-click project scope: an "All" disc plus a stack of discs, as many as the row's width
 * fits; the rest sit behind a "+N" menu. App projects come first in the sidebar's own sort
 * order, then dashed "add" discs for Jira projects the app does not have yet. The selection
 * sits on top of the stack; discs further from it sit further back.
 */
export function T3TeamSidebarProjectScopePillsView({
  groups,
  addable,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
}: PillsProps & { addable: ReadonlyArray<JiraCatalogProject> }) {
  const [ref, width] = useMeasuredWidth();
  const items = useMemo(() => buildScopePillItems(groups, addable), [groups, addable]);
  const { shown, overflow } = splitProjectScopePills(
    items,
    activeScopeKey,
    projectScopeDiscCapacity(width),
  );
  // Index 0 is "All"; the selection (or "All") is the top of the pyramid.
  const activeIndex = shown.findIndex((item) => item.projectKey === activeScopeKey) + 1;
  const total = shown.length + 1;
  const disc = (index: number) => projectScopeDiscDepth(index, activeIndex);

  return (
    <TooltipProvider delay={300} closeDelay={0}>
      <div
        ref={ref}
        role="group"
        aria-label="Project scope"
        // Left inset matches the search field's padding above; the vertical inset keeps the
        // lifted selection's top edge inside the clipping box.
        className="flex min-w-0 flex-1 items-center overflow-hidden py-0.5 pl-2"
      >
        <div className="flex items-center">
          <T3TeamSidebarProjectScopeDisc
            label="All projects"
            active={activeIndex === 0}
            {...disc(0)}
            zIndex={total - disc(0).depth}
            first
            onSelect={() => onSelectScope(null)}
          >
            <FolderIcon className="size-4" />
          </T3TeamSidebarProjectScopeDisc>
          {shown.map((item, i) => {
            const index = i + 1;
            const common = {
              active: index === activeIndex,
              ...disc(index),
              zIndex: total - disc(index).depth,
              first: false,
            };
            return item.kind === "app" ? (
              <T3TeamSidebarProjectScopeDisc
                key={item.projectKey}
                {...common}
                label={item.group.displayName}
                onSelect={() => onSelectScope(item.projectKey)}
                onContextMenu={
                  onProjectContextMenu
                    ? (event) => onProjectContextMenu(event, item.group)
                    : undefined
                }
              >
                <GroupIcon group={item.group} />
              </T3TeamSidebarProjectScopeDisc>
            ) : (
              <T3TeamSidebarProjectScopeDisc
                key={item.projectKey}
                {...common}
                label={item.label}
                variant="add"
                disabledReason={addDisabledReason}
                onSelect={() => addJiraProject(item.entry)}
              >
                <JiraProjectGlyph entry={item.entry} />
              </T3TeamSidebarProjectScopeDisc>
            );
          })}
          <T3TeamSidebarProjectScopeOverflow
            entries={overflow.map((item) => overflowEntry(item, onSelectScope))}
            zIndex={1}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
