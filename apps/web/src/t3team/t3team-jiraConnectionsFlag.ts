import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

/** Shown where a Jira sign-in would be while `INTEGRATIONS_ATLASSIAN` is off. Connections made
 * earlier keep serving their projects; only new ones are refused. */
export const JIRA_CONNECTIONS_OFF_TEXT =
  "Connecting Jira is turned off on this host. Turn on Jira and Tempo in Settings → Features.";

export function useJiraConnectionsEnabled(): boolean {
  return useFeatureFlag("INTEGRATIONS_ATLASSIAN");
}
