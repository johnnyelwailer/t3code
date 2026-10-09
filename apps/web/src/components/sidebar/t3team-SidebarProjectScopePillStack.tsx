import { FolderIcon } from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { T3TeamSidebarProjectScopeDisc } from "./t3team-SidebarProjectScopeDisc";
import { JiraProjectGlyph } from "./t3team-SidebarProjectScopeJiraGlyph";
import { T3TeamSidebarProjectScopePicker } from "./t3team-SidebarProjectScopePicker";
import {
  GroupIcon,
  addDisabledReason,
  addJiraProject,
} from "./t3team-sidebarProjectScopePills.actions";
import { type ScopePillItem } from "./t3team-sidebarProjectScopePills.items";
import { projectScopeDiscDepth } from "./t3team-sidebarProjectScopePills.logic";

/** The All disc, the discs that fit, and the picker disc ("+N" or search) for every project. */
export function T3TeamSidebarProjectScopePillStack({
  shown,
  overflow,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
  pickerAnchor,
}: {
  shown: ReadonlyArray<ScopePillItem>;
  overflow: ReadonlyArray<ScopePillItem>;
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
  const activeIndex = shown.findIndex((item) => item.projectKey === activeScopeKey) + 1;
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
              onProjectContextMenu ? (event) => onProjectContextMenu(event, item.group) : undefined
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
      <T3TeamSidebarProjectScopePicker
        shown={shown}
        overflow={overflow}
        activeScopeKey={activeScopeKey}
        onSelectScope={onSelectScope}
        onProjectContextMenu={onProjectContextMenu}
        anchor={pickerAnchor}
        zIndex={1}
      />
    </div>
  );
}
