import type {
  WorkspaceTab,
  WorkspaceTabsAction,
  WorkspaceTabsState,
} from "../features/workspace/workspace-tabs-state";
import type { WorkspaceExtraTab } from "./t3team-extensionTypes";

/**
 * The workspace has room for one extra tab. Its pane and native destination are kept under this
 * fixed key whatever its `id`. It is not a `WorkspaceTab`: the stock tab types stay closed, and
 * selecting it is the `extraSelected` flag of the workspace tabs state.
 */
export const EXTRA_WORKSPACE_TAB = "extra";

/** A pane of the workspace: a stock tab, or the distribution's extra tab. */
export type WorkspacePane = WorkspaceTab | typeof EXTRA_WORKSPACE_TAB;

type Placement = Pick<WorkspaceExtraTab, "placement"> | null;

/**
 * The visible stock destinations with the extra tab where it asks to be: "start" before the first,
 * "center" right after Chats (first when Chats is hidden). Without an extra tab, the list as given.
 */
export function placeExtraTab(stock: readonly string[], extra: Placement): readonly string[] {
  if (extra === null) return stock;
  const at = extra.placement === "start" ? 0 : stock.indexOf("threads") + 1;
  return [...stock.slice(0, at), EXTRA_WORKSPACE_TAB, ...stock.slice(at)];
}

/** Whether the workspace opens on the extra tab. */
export function launchesOnExtraTab(extra: Pick<WorkspaceExtraTab, "selectOnLaunch"> | null) {
  return extra?.selectOnLaunch === true;
}

/**
 * Whether the extra tab is the selected one, as the screen shows it: once the distribution has
 * taken it away, nothing is selected on it.
 */
export function extraTabSelected(
  state: Pick<WorkspaceTabsState, "extraSelected">,
  extra: object | null,
): boolean {
  return state.extraSelected === true && extra !== null;
}

/**
 * The selection that moves an untouched workspace onto an extra tab that asks for it. It covers a
 * tab that only shows up after the workspace mounted (a store that loads late); once the user has
 * chosen a tab, it is null.
 */
export function lateLaunchSelection(
  extra: Pick<WorkspaceExtraTab, "selectOnLaunch"> | null,
  state: Pick<WorkspaceTabsState, "extraSelected" | "selectionRevision">,
): WorkspaceTabsAction | null {
  return launchesOnExtraTab(extra) && state.selectionRevision === 0 && state.extraSelected !== true
    ? { type: "selectExtra" }
    : null;
}
