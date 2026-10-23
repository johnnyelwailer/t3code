import { useJiraConnectionsEnabled } from "../../t3team/t3team-jiraConnectionsFlag";
import { useFeatureFlag } from "../../t3team/t3team-useFeatureFlag";

/** Connected Tools holds the CLI tool card (`INTEGRATIONS_TOOL_AUTH`) and the Jira connections
 * (`INTEGRATIONS_ATLASSIAN`); with both off the page has nothing to show. */
export function useConnectedToolsSettingsVisible(): boolean {
  const toolAuthEnabled = useFeatureFlag("INTEGRATIONS_TOOL_AUTH");
  return useJiraConnectionsEnabled() || toolAuthEnabled;
}
