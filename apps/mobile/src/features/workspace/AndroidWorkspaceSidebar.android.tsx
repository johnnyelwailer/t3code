import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { WorkspaceExtraTabPane } from "../../extensions/t3team-WorkspaceExtraTabPane";
import { useWorkspaceExtraTab } from "../../extensions/t3team-useWorkspaceExtraTab";
import { visibleWorkspaceTab, workspacePaneTabs } from "../../extensions/t3team-workspaceExtraTab";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { PullRequestFilterMenuProvider } from "../pull-requests/PullRequestFilterMenuContext";
import { PullRequestsScreen } from "../pull-requests/PullRequestsScreen";
import { PullRequestToolbar } from "../pull-requests/PullRequestToolbar.android";
import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import { WorkspaceTabPanes } from "./WorkspaceTabPanes";

export function AndroidWorkspaceSidebar(props: {
  readonly children: ReactNode;
  readonly onRequestVisibility: () => void;
  readonly selectedPullRequestKey: string | null;
}) {
  const workspace = useWorkspaceTabs()!;
  const extraTab = useWorkspaceExtraTab();
  const context = useMemo(() => ({ ...workspace, bottomClearance: 16 }), [workspace]);
  return (
    <WorkspaceTabPanes
      tabs={workspacePaneTabs(extraTab)}
      selected={visibleWorkspaceTab(workspace.state.selectedTab, extraTab)}
      renderTab={(tab) =>
        tab === "threads" ? (
          props.children
        ) : tab === "extra" ? (
          <WorkspaceExtraTabPane tab={extraTab} />
        ) : (
          <WorkspaceTabsContext value={context}>
            <PullRequestFilterMenuProvider>
              <View className="flex-1 bg-header">
                <PullRequestToolbar onRequestVisibility={props.onRequestVisibility} />
                <ScreenContent insetHorizontal>
                  <PullRequestsScreen
                    sidebar
                    selectedPullRequestKey={props.selectedPullRequestKey}
                  />
                </ScreenContent>
              </View>
            </PullRequestFilterMenuProvider>
          </WorkspaceTabsContext>
        )
      }
    />
  );
}
