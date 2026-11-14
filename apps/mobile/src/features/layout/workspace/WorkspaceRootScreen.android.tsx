import { useEffect, useRef } from "react";
import { useAndroidFloatingTabs } from "../../settings/appearance/AppearancePreferencesProvider";
import { WorkspaceNoTabs } from "./WorkspaceNoTabs";
import { useEnabledNavigationTabs } from "./navigation-tabs";
import { NAVIGATION_TAB_ORDER } from "./navigation-tab-order";
import { WorkspaceExtraTab } from "./WorkspaceExtraTab";
import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenOptions } from "../../../native/StackHeader";
import { AppBar } from "../../../components/ui/AppBar";
import { WorkspaceEmptyDetail } from "../WorkspaceEmptyDetail";
import { ScreenContent } from "../../../components/ui/ScreenContent";
import { useAndroidControlSizing } from "../../../components/ui/useAndroidControlSizing";
import { WorkspaceExtraTabPane } from "../../../extensions/t3team-WorkspaceExtraTabPane";
import { useWorkspaceExtraTab } from "../../../extensions/t3team-useWorkspaceExtraTab";
import {
  EXTRA_WORKSPACE_TAB,
  extraTabSelected,
  lateLaunchSelection,
  type WorkspacePane,
} from "../../../extensions/t3team-workspaceExtraTab";
import { HomeRouteScreen } from "../../home/HomeRouteScreen";
import { PullRequestsScreen } from "../../pull-requests/PullRequestsScreen";
import { PullRequestToolbar } from "./PullRequestToolbar.android";
import { useAdaptiveWorkspaceLayout } from "../AdaptiveWorkspaceLayout";
import { WorkspaceSettledContentWidthContext } from "../workspace-content-width";
import { AndroidWorkspaceNavigation, FloatingWorkspaceTabs } from "./AndroidWorkspaceNavigation";
import { FLOATING_TABS } from "./floating-workspace-tabs";
import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import { WorkspaceTabPanes } from "./WorkspaceTabPanes";
import { WorkspaceAppBarScope } from "../../../components/ui/WorkspaceAppBar.android";
import { usePaneRole } from "../../../components/ui/Pane";
import { AndroidWorkspaceSidebar } from "./AndroidWorkspaceSidebar.android";
import type { WorkspaceTab } from "./workspace-tabs-state";

const TABS: readonly WorkspaceTab[] = NAVIGATION_TAB_ORDER;

export function WorkspaceRootScreen() {
  return usePaneRole() === "sidebar" ? <AndroidWorkspaceSidebar /> : <WorkspaceRoot />;
}

function WorkspaceRoot() {
  const floatingTabsEnabled = useAndroidFloatingTabs();
  const { layout, startNewTask, workspacePageWidth } = useAdaptiveWorkspaceLayout();
  const workspace = useWorkspaceTabs()!;
  const enabled = useEnabledNavigationTabs();
  const insets = useSafeAreaInsets();
  const { fabClearance, fabSize } = useAndroidControlSizing();
  const extraTab = useWorkspaceExtraTab();
  const { state, dispatch } = workspace;
  const extraSelected = extraTabSelected(state, extraTab);
  // The pane on show; while the extra tab is selected, `selectedTab` keeps its last stock value.
  const pane: WorkspacePane = extraSelected ? EXTRA_WORKSPACE_TAB : state.selectedTab;
  const tabs: readonly WorkspacePane[] = extraTab === null ? TABS : [...TABS, EXTRA_WORKSPACE_TAB];
  const context = {
    ...workspace,
    bottomClearance: layout.usesSplitView
      ? workspace.bottomClearance
      : floatingTabsEnabled
        ? insets.bottom + FLOATING_TABS.bottom + FLOATING_TABS.edge + fabSize
        : pane === "threads"
          ? fabClearance + 16
          : 16,
  };
  // An extra tab that appears late and asks for it opens untouched workspaces once; one that
  // went away while selected hands the selection back to the last stock tab.
  const launched = useRef(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the selection in step with the distribution's tab slot, which appears or disappears at runtime outside React state
  useEffect(() => {
    if (extraTab !== null && !launched.current) {
      launched.current = true;
      const selection = lateLaunchSelection(extraTab, state);
      if (selection) dispatch(selection);
    }
    if (state.extraSelected && extraTab === null) {
      dispatch({ type: "select", tab: state.selectedTab });
    }
  }, [extraTab, state, dispatch]);

  return (
    <WorkspaceTabsContext value={context}>
      <View className={layout.usesSplitView ? "flex-1 bg-screen" : "flex-1 bg-header"}>
        {!layout.usesSplitView ? (
          <NativeStackScreenOptions options={{ headerShown: false }} />
        ) : null}
        <SafeAreaInsetsContext
          value={
            layout.usesSplitView
              ? insets
              : floatingTabsEnabled
                ? pane === "usage" || pane === EXTRA_WORKSPACE_TAB
                  ? { ...insets, bottom: context.bottomClearance }
                  : insets
                : { ...insets, bottom: 0 }
          }
        >
          {enabled.length === 0 && (layout.usesSplitView || extraTab === null) ? (
            layout.usesSplitView ? (
              <View className="flex-1 bg-screen" />
            ) : (
              <WorkspaceNoTabs />
            )
          ) : (
            <WorkspaceAppBarScope enabled={!layout.usesSplitView}>
              <WorkspaceTabPanes
                // The extra tab lives in the sidebar column; its detail pane stays the empty chat detail.
                tabs={layout.usesSplitView ? TABS : tabs}
                selected={layout.usesSplitView && extraSelected ? "threads" : pane}
                renderTab={(tab) =>
                  tab === "threads" ? (
                    <HomeRouteScreen />
                  ) : tab === "extra" ? (
                    <WorkspaceExtraTabPane tab={extraTab} />
                  ) : tab !== "pullRequests" ? (
                    <WorkspacePageFrame width={workspacePageWidth ?? null}>
                      <WorkspaceExtraTab tab={tab} />
                    </WorkspacePageFrame>
                  ) : layout.usesSplitView ? (
                    <>
                      <NativeStackScreenOptions options={{ headerShown: false }} />
                      <AppBar embedded title="Pull requests" />
                      <WorkspaceEmptyDetail tab="pullRequests" />
                    </>
                  ) : (
                    <PullRequestsScreen
                      renderFrame={(filters, list) => (
                        <>
                          <PullRequestToolbar filters={filters} />
                          <ScreenContent>{list}</ScreenContent>
                        </>
                      )}
                    />
                  )
                }
              />
            </WorkspaceAppBarScope>
          )}
        </SafeAreaInsetsContext>
        {layout.usesSplitView ? null : floatingTabsEnabled ? (
          <FloatingWorkspaceTabs fillWidth onNewThread={startNewTask} />
        ) : (
          <AndroidWorkspaceNavigation onNewThread={startNewTask} />
        )}
      </View>
    </WorkspaceTabsContext>
  );
}

// Hidden, the page sits in the narrower pane beside the list; laying it out at the width it opens
// at keeps measured bars and breakpoints from catching up a frame after it appears.
function WorkspacePageFrame(props: {
  readonly width: number | null;
  readonly children: ReactNode;
}) {
  if (props.width === null) return props.children;
  return (
    <WorkspaceSettledContentWidthContext value={props.width}>
      <View style={{ flex: 1, width: props.width }}>{props.children}</View>
    </WorkspaceSettledContentWidthContext>
  );
}
