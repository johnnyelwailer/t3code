import { useEffect, useRef } from "react";
import { useAndroidFloatingTabs } from "../settings/appearance/AppearancePreferencesProvider";
import { WorkspaceNoTabs } from "./WorkspaceNoTabs";
import { useEnabledNavigationTabs } from "./navigation-tabs";
import { NAVIGATION_TAB_ORDER } from "./navigation-tab-order";
import { WorkspaceExtraTab } from "./WorkspaceExtraTab";
import { useWindowDimensions, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { AndroidScreenHeader } from "../../components/ui/AndroidScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { useAndroidControlSizing } from "../../components/ui/useAndroidControlSizing";
import { WorkspaceExtraTabPane } from "../../extensions/t3team-WorkspaceExtraTabPane";
import { useWorkspaceExtraTab } from "../../extensions/t3team-useWorkspaceExtraTab";
import {
  EXTRA_WORKSPACE_TAB,
  extraTabSelected,
  lateLaunchSelection,
  type WorkspacePane,
} from "../../extensions/t3team-workspaceExtraTab";
import { HomeRouteScreen } from "../home/HomeRouteScreen";
import { PullRequestsScreen } from "../pull-requests/PullRequestsScreen";
import { PullRequestToolbar } from "../pull-requests/PullRequestToolbar.android";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { AndroidWorkspaceNavigation, FloatingWorkspaceTabs } from "./AndroidWorkspaceNavigation";
import { FLOATING_TABS, floatingTabsMetrics } from "./floating-workspace-tabs";
import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import { WorkspaceTabPanes } from "./WorkspaceTabPanes";
import type { WorkspaceTab } from "./workspace-tabs-state";

const TABS: readonly WorkspaceTab[] = NAVIGATION_TAB_ORDER;

export function WorkspaceRootScreen() {
  const floatingTabsEnabled = useAndroidFloatingTabs();
  const { layout, startNewTask } = useAdaptiveWorkspaceLayout();
  const workspace = useWorkspaceTabs()!;
  const enabled = useEnabledNavigationTabs();
  const insets = useSafeAreaInsets();
  const { fabClearance, scale, fabSize } = useAndroidControlSizing();
  const window = useWindowDimensions();
  const extraTab = useWorkspaceExtraTab();
  const { state, dispatch } = workspace;
  const extraSelected = extraTabSelected(state, extraTab);
  // The pane on show; while the extra tab is selected, `selectedTab` keeps its last stock value.
  const pane: WorkspacePane = extraSelected ? EXTRA_WORKSPACE_TAB : state.selectedTab;
  const tabs: readonly WorkspacePane[] = extraTab === null ? TABS : [...TABS, EXTRA_WORKSPACE_TAB];
  const floating = floatingTabsMetrics(
    enabled.length + 1 + (extraTab === null ? 0 : 1),
    scale,
    fabSize,
    window.width,
  );
  const context = {
    ...workspace,
    bottomClearance: floatingTabsEnabled
      ? insets.bottom +
        FLOATING_TABS.bottom +
        FLOATING_TABS.edge +
        Math.max(floating.height, pane === "threads" ? floating.fabOffset + fabSize : 0)
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

  if (layout.usesSplitView) {
    if (enabled.length === 0) return <View className="flex-1 bg-screen" />;
    return (
      <WorkspaceTabPanes
        tabs={TABS}
        // The extra tab lives in the sidebar column; its detail pane stays the empty chat detail.
        selected={extraSelected ? "threads" : state.selectedTab}
        renderTab={(tab) =>
          tab === "threads" ? (
            <HomeRouteScreen />
          ) : tab !== "pullRequests" ? (
            <WorkspaceExtraTab tab={tab} />
          ) : (
            <>
              <NativeStackScreenOptions options={{ headerShown: false }} />
              <AndroidScreenHeader title="Pull requests" />
              <View className="flex-1 items-center justify-center px-10">
                <EmptyState
                  title="Select a pull request"
                  detail="Choose a pull request from the sidebar to review it."
                  variant="plain"
                />
              </View>
            </>
          )
        }
      />
    );
  }

  return (
    <WorkspaceTabsContext value={context}>
      <View className="flex-1 bg-header">
        <NativeStackScreenOptions options={{ headerShown: false }} />
        <SafeAreaInsetsContext
          value={
            floatingTabsEnabled
              ? pane === "usage" || pane === EXTRA_WORKSPACE_TAB
                ? { ...insets, bottom: context.bottomClearance }
                : insets
              : { ...insets, bottom: 0 }
          }
        >
          {enabled.length === 0 && extraTab === null ? (
            <WorkspaceNoTabs />
          ) : (
            <WorkspaceTabPanes
              tabs={tabs}
              selected={pane}
              renderTab={(tab) =>
                tab === "threads" ? (
                  <HomeRouteScreen />
                ) : tab === "extra" ? (
                  <WorkspaceExtraTabPane tab={extraTab} />
                ) : tab !== "pullRequests" ? (
                  <WorkspaceExtraTab tab={tab} />
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
          )}
        </SafeAreaInsetsContext>
        {floatingTabsEnabled ? (
          <FloatingWorkspaceTabs fillWidth onNewThread={startNewTask} />
        ) : (
          <AndroidWorkspaceNavigation onNewThread={startNewTask} />
        )}
      </View>
    </WorkspaceTabsContext>
  );
}
