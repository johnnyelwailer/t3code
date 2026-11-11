import { useAndroidFloatingTabs } from "../../settings/appearance/AppearancePreferencesProvider";
import { WorkspaceNoTabs } from "./WorkspaceNoTabs";
import { useEnabledNavigationTabs } from "./navigation-tabs";
import { NAVIGATION_TAB_ORDER } from "./navigation-tab-order";
import { useNavigationState } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAndroidControlSizing } from "../../../components/ui/useAndroidControlSizing";
import { FLOATING_TABS } from "./floating-workspace-tabs";
import { View } from "react-native";
import { WorkspaceExtraTabPane } from "../../../extensions/t3team-WorkspaceExtraTabPane";
import { useWorkspaceExtraTab } from "../../../extensions/t3team-useWorkspaceExtraTab";
import {
  EXTRA_WORKSPACE_TAB,
  extraTabSelected,
  type WorkspacePane,
} from "../../../extensions/t3team-workspaceExtraTab";
import { ScreenContent } from "../../../components/ui/ScreenContent";
import { PullRequestsScreen } from "../../pull-requests/PullRequestsScreen";
import { PullRequestToolbar } from "./PullRequestToolbar.android";
import { selectedPullRequestKey } from "../../pull-requests/pullRequestSelection";
import { AndroidHomeFabLayout } from "../../home/AndroidHomeFab";
import { useAdaptiveWorkspaceLayout } from "../adaptive-workspace-context";
import { useAndroidWorkspaceRoot } from "./AndroidWorkspaceTabsProvider";
import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import { WorkspaceTabPanes } from "./WorkspaceTabPanes";
import { WorkspaceThreadSidebar } from "./WorkspaceThreadSidebar";
import { WorkspaceAppBarScope } from "../../../components/ui/WorkspaceAppBar.android";

/** The Home route in the sidebar column: the selected tab's list. */
export function AndroidWorkspaceSidebar() {
  const floatingTabsEnabled = useAndroidFloatingTabs();
  const workspace = useWorkspaceTabs()!;
  const enabled = useEnabledNavigationTabs();
  const extraTab = useWorkspaceExtraTab();
  const insets = useSafeAreaInsets();
  const { fabSize } = useAndroidControlSizing();
  const { revealPrimarySidebar, startNewTask } = useAdaptiveWorkspaceLayout();
  const selectedPullRequest = useNavigationState(selectedPullRequestKey);
  // Settings and Usage cover the sidebar.
  const coveredByPage =
    (useAndroidWorkspaceRoot()?.settingsOpen ?? false) || workspace.state.selectedTab === "usage";
  const bottomClearance = floatingTabsEnabled
    ? insets.bottom + FLOATING_TABS.bottom + FLOATING_TABS.edge + fabSize
    : 16;
  const context = { ...workspace, bottomClearance };
  if (enabled.length === 0 && extraTab === null) return <WorkspaceNoTabs />;
  const tabs: readonly WorkspacePane[] =
    extraTab === null ? NAVIGATION_TAB_ORDER : [...NAVIGATION_TAB_ORDER, EXTRA_WORKSPACE_TAB];
  return (
    <WorkspaceAppBarScope>
      <WorkspaceTabPanes
        tabs={tabs}
        selected={
          extraTabSelected(workspace.state, extraTab)
            ? EXTRA_WORKSPACE_TAB
            : workspace.state.selectedTab
        }
        renderTab={(tab) =>
          tab === "threads" ? (
            <AndroidHomeFabLayout sidebar disabled={coveredByPage} onStartNewTask={startNewTask}>
              <WorkspaceThreadSidebar />
            </AndroidHomeFabLayout>
          ) : tab === "extra" ? (
            <WorkspaceExtraTabPane tab={extraTab} />
          ) : tab !== "pullRequests" ? (
            <View className="flex-1 bg-screen" />
          ) : (
            <WorkspaceTabsContext value={context}>
              <PullRequestsScreen
                sidebar
                selectedPullRequestKey={selectedPullRequest}
                renderFrame={(filters, list) => (
                  <View className="flex-1 bg-header">
                    <PullRequestToolbar
                      filters={filters}
                      onRequestVisibility={revealPrimarySidebar}
                    />
                    <ScreenContent insetHorizontal>{list}</ScreenContent>
                  </View>
                )}
              />
            </WorkspaceTabsContext>
          )
        }
      />
    </WorkspaceAppBarScope>
  );
}
