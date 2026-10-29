import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { AndroidScreenHeader } from "../../components/ui/AndroidScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { useAndroidControlSizing } from "../../components/ui/useAndroidControlSizing";
import { WorkspaceExtraTabPane } from "../../extensions/t3team-WorkspaceExtraTabPane";
import { useWorkspaceExtraTab } from "../../extensions/t3team-useWorkspaceExtraTab";
import {
  lateLaunchSelection,
  visibleWorkspaceTab,
  workspacePaneTabs,
} from "../../extensions/t3team-workspaceExtraTab";
import { HomeRouteScreen } from "../home/HomeRouteScreen";
import { PullRequestFilterMenuProvider } from "../pull-requests/PullRequestFilterMenuContext";
import { PullRequestsScreen } from "../pull-requests/PullRequestsScreen";
import { PullRequestToolbar } from "../pull-requests/PullRequestToolbar.android";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { AndroidWorkspaceNavigation } from "./AndroidWorkspaceNavigation";
import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import { WorkspaceTabPanes } from "./WorkspaceTabPanes";
import type { WorkspaceTab } from "./workspace-tabs-state";

const SPLIT_TABS: readonly WorkspaceTab[] = ["threads", "pullRequests"];
export function WorkspaceRootScreen() {
  const { layout, startNewTask } = useAdaptiveWorkspaceLayout();
  const workspace = useWorkspaceTabs()!;
  const insets = useSafeAreaInsets();
  const { fabClearance } = useAndroidControlSizing();
  const context = useMemo(
    () => ({
      ...workspace,
      bottomClearance: workspace.state.selectedTab === "threads" ? fabClearance + 16 : 16,
    }),
    [workspace, fabClearance],
  );
  const extraTab = useWorkspaceExtraTab();
  const tab = visibleWorkspaceTab(workspace.state.selectedTab, extraTab);
  const tabs = workspacePaneTabs(extraTab);
  // An extra tab that appears late and asks for it opens untouched workspaces once; one that
  // went away while selected hands the selection back to Chats.
  const launched = useRef(false);
  const { state, dispatch } = workspace;
  useEffect(() => {
    if (extraTab !== null && !launched.current) {
      launched.current = true;
      const selection = lateLaunchSelection(extraTab, state);
      if (selection) dispatch(selection);
    }
    if (tab !== state.selectedTab) dispatch({ type: "select", tab });
  }, [extraTab, state, tab, dispatch]);

  if (layout.usesSplitView) {
    return (
      <WorkspaceTabPanes
        tabs={SPLIT_TABS}
        // The extra tab lives in the sidebar column; its detail pane stays the empty chat detail.
        selected={tab === "extra" ? "threads" : tab}
        renderTab={(tab) =>
          tab === "threads" ? (
            <HomeRouteScreen />
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
        <SafeAreaInsetsContext value={{ ...insets, bottom: 0 }}>
          <WorkspaceTabPanes
            tabs={tabs}
            selected={tab}
            renderTab={(tab) =>
              tab === "threads" ? (
                <HomeRouteScreen />
              ) : tab === "extra" ? (
                <WorkspaceExtraTabPane tab={extraTab} />
              ) : (
                <PullRequestFilterMenuProvider>
                  <PullRequestToolbar />
                  <ScreenContent>
                    <PullRequestsScreen />
                  </ScreenContent>
                </PullRequestFilterMenuProvider>
              )
            }
          />
        </SafeAreaInsetsContext>
        <AndroidWorkspaceNavigation onNewThread={startNewTask} />
      </View>
    </WorkspaceTabsContext>
  );
}
