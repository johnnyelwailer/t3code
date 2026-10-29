import type {
  WorkspaceTab,
  WorkspaceTabsAction,
  WorkspaceTabsState,
} from "../features/workspace/workspace-tabs-state";
import type { WorkspaceExtraTab } from "./t3team-extensionTypes";

/**
 * The workspace has room for one extra tab. It is kept under this fixed key whatever its `id`,
 * so the tab state, scroll offsets and panes stay typed as a closed set.
 */
export const EXTRA_WORKSPACE_TAB = "extra" satisfies WorkspaceTab;

type Placement = Pick<WorkspaceExtraTab, "placement"> | null;

/** The pane order of the workspace: the stock tabs, with the extra one placed where it asks. */
export function workspacePaneTabs(extra: Placement): readonly WorkspaceTab[] {
  if (extra === null) return ["threads", "pullRequests"];
  return extra.placement === "start"
    ? [EXTRA_WORKSPACE_TAB, "threads", "pullRequests"]
    : ["threads", EXTRA_WORKSPACE_TAB, "pullRequests"];
}

/**
 * The tabs the native Android navigation draws, in order. A stock tab carries no title (the native
 * side owns its title and icon); without an extra tab the list is exactly the stock three.
 */
export function nativeWorkspaceTabs(
  extra: Pick<WorkspaceExtraTab, "placement" | "title"> | null,
): ReadonlyArray<{ readonly id: WorkspaceTab | "settings"; readonly title?: string }> {
  const tabs = workspacePaneTabs(extra).map((id) =>
    id === EXTRA_WORKSPACE_TAB && extra !== null ? { id, title: extra.title } : { id },
  );
  return [...tabs, { id: "settings" }];
}

/** The tab the workspace opens on. */
export function launchWorkspaceTab(extra: Pick<WorkspaceExtraTab, "selectOnLaunch"> | null) {
  return extra?.selectOnLaunch === true ? EXTRA_WORKSPACE_TAB : "threads";
}

/**
 * The selected tab as the screen shows it: the extra tab, once the distribution has taken it away,
 * falls back to Chats.
 */
export function visibleWorkspaceTab(selected: WorkspaceTab, extra: object | null): WorkspaceTab {
  return selected === EXTRA_WORKSPACE_TAB && extra === null ? "threads" : selected;
}

/**
 * The selection that moves an untouched workspace onto an extra tab that asks for it. It covers a
 * tab that only shows up after the workspace mounted (a store that loads late); once the user has
 * chosen a tab, it is null.
 */
export function lateLaunchSelection(
  extra: Pick<WorkspaceExtraTab, "selectOnLaunch"> | null,
  state: Pick<WorkspaceTabsState, "selectedTab" | "selectionRevision">,
): WorkspaceTabsAction | null {
  return extra?.selectOnLaunch === true &&
    state.selectionRevision === 0 &&
    state.selectedTab !== EXTRA_WORKSPACE_TAB
    ? { type: "select", tab: EXTRA_WORKSPACE_TAB }
    : null;
}
