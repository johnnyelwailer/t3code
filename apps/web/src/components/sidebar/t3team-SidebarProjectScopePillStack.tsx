import { FolderIcon } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import type { JiraCatalogProject } from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import { requestT3TeamCreateProject } from "~/t3team/t3team-createProjectRequest";

import { ProjectFavicon } from "../ProjectFavicon";
import { T3TeamSidebarProjectScopeDisc } from "./t3team-SidebarProjectScopeDisc";
import { JiraProjectGlyph } from "./t3team-SidebarProjectScopeJiraGlyph";
import {
  T3TeamSidebarProjectScopeOverflow,
  type ScopeOverflowEntry,
} from "./t3team-SidebarProjectScopeOverflow";
import { type ScopePillItem } from "./t3team-sidebarProjectScopePills.items";
import {
  ADD_PILL_CLICK_BEHAVIOR,
  projectScopeDiscDepth,
} from "./t3team-sidebarProjectScopePills.logic";

const ADD_DISABLED_REASON = "Not in the app yet. Add it from the Add project menu.";
const addDisabledReason = ADD_PILL_CLICK_BEHAVIOR === "disabled" ? ADD_DISABLED_REASON : undefined;

function addJiraProject(entry: JiraCatalogProject) {
  requestT3TeamCreateProject({
    accountId: entry.accountId,
    externalProjectId: entry.externalProjectId,
  });
}

function GroupIcon({ group }: { group: SidebarProjectSnapshot }) {
  return <ProjectFavicon project={group} className="size-4 shrink-0" />;
}

function overflowEntry(
  item: ScopePillItem,
  onSelectScope: (scopeKey: string | null) => void,
): ScopeOverflowEntry {
  return item.kind === "app"
    ? {
        key: item.projectKey,
        label: item.group.displayName,
        kind: "app",
        icon: <GroupIcon group={item.group} />,
        onSelect: () => onSelectScope(item.projectKey),
      }
    : {
        key: item.projectKey,
        label: item.label,
        kind: "add",
        icon: <JiraProjectGlyph entry={item.entry} />,
        disabledReason: addDisabledReason,
        onSelect: () => addJiraProject(item.entry),
      };
}

/** The All disc, the discs that fit, and the +N menu for the rest. */
export function T3TeamSidebarProjectScopePillStack({
  shown,
  overflow,
  activeScopeKey,
  onSelectScope,
  onProjectContextMenu,
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
}) {
  const activeIndex = shown.findIndex((item) => item.projectKey === activeScopeKey) + 1;
  const total = shown.length + 1;
  const disc = (index: number) => projectScopeDiscDepth(index, activeIndex);
  return (
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
      <T3TeamSidebarProjectScopeOverflow
        entries={overflow.map((item) => overflowEntry(item, onSelectScope))}
        zIndex={1}
      />
    </div>
  );
}
