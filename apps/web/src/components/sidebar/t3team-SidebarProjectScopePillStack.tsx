import { FolderIcon } from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";

import { T3TeamSidebarProjectScopeDisc } from "./t3team-SidebarProjectScopeDisc";
import { T3TeamSidebarProjectScopePicker } from "./t3team-SidebarProjectScopePicker";
import { GroupIcon } from "./t3team-sidebarProjectScopePills.actions";
import { projectScopeDiscDepth } from "./t3team-sidebarProjectScopePills.logic";

/** The All disc, the discs that fit, and the picker disc ("+N" or search) for every project. */
export function T3TeamSidebarProjectScopePillStack({
  shown,
  overflow,
  addable,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
  pickerAnchor,
}: {
  shown: ReadonlyArray<SidebarProjectSnapshot>;
  overflow: ReadonlyArray<SidebarProjectSnapshot>;
  addable: ReadonlyArray<JiraCatalogProject>;
  activeScopeKey: string | null;
  onSelectScope: (scopeKey: string | null) => void;
  onProjectContextMenu?:
    | ((
        event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLInputElement>,
        projectGroup: SidebarProjectSnapshot,
      ) => void)
    | undefined;
  pickerAnchor?: RefObject<HTMLElement | null> | undefined;
}) {
  const activeIndex = shown.findIndex((group) => group.projectKey === activeScopeKey) + 1;
  const total = shown.length + 1;
  const disc = (index: number) => projectScopeDiscDepth(index, activeIndex);
  return (
    <div className="flex items-center">
      <T3TeamSidebarProjectScopeDisc
        label="All projects"
        // A scope with no disc (no room at all) is still a scope: "All" is lit only when unscoped.
        active={activeScopeKey === null}
        {...disc(0)}
        zIndex={total - disc(0).depth}
        first
        onSelect={() => onSelectScope(null)}
      >
        <FolderIcon className="size-4" />
      </T3TeamSidebarProjectScopeDisc>
      {shown.map((group, i) => {
        const index = i + 1;
        const common = {
          active: index === activeIndex,
          ...disc(index),
          zIndex: total - disc(index).depth,
          first: false,
        };
        return (
          <T3TeamSidebarProjectScopeDisc
            key={group.projectKey}
            {...common}
            label={group.displayName}
            onSelect={() => onSelectScope(group.projectKey)}
            onContextMenu={
              onProjectContextMenu ? (event) => onProjectContextMenu(event, group) : undefined
            }
          >
            <GroupIcon group={group} />
          </T3TeamSidebarProjectScopeDisc>
        );
      })}
      <T3TeamSidebarProjectScopePicker
        shown={shown}
        overflow={overflow}
        addable={addable}
        activeScopeKey={activeScopeKey}
        onSelectScope={onSelectScope}
        onProjectContextMenu={onProjectContextMenu}
        anchor={pickerAnchor}
        zIndex={1}
      />
    </div>
  );
}
