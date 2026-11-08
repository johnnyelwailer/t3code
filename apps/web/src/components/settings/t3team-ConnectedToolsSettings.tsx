"use client";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { useJiraConnectionsEnabled } from "../../t3team/t3team-jiraConnectionsFlag";
import { useFeatureFlag } from "../../t3team/t3team-useFeatureFlag";
import { useToolAuthActions, useToolAuthStates } from "../../state/t3team-toolauth";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { JiraConnectionSettings } from "./t3team-JiraConnectionSettings";
import { ToolAuthCard } from "./t3team-ToolAuthCard";
import { TOOL_AUTH_TOOLS, type ToolAuthToolMeta } from "./t3team-toolAuthTools";

function ConnectedToolCard({ meta }: { readonly meta: ToolAuthToolMeta }) {
  const environmentId = usePrimaryEnvironmentId();
  const states = useToolAuthStates(environmentId);
  const { onConnect, onSubmitCode, onCancel } = useToolAuthActions(meta);

  return (
    <ToolAuthCard
      meta={meta}
      state={states.get(meta.tool)}
      onConnect={onConnect}
      onSubmitCode={onSubmitCode}
      onCancel={onCancel}
    />
  );
}

/** Each section has its own switch; the nav entry hides with both
 * (`t3team-connectedToolsSettingsVisible.ts`). */
export function ConnectedToolsSettings() {
  const toolAuthEnabled = useFeatureFlag("INTEGRATIONS_TOOL_AUTH");
  const jiraEnabled = useJiraConnectionsEnabled();
  return (
    <SettingsPageContainer>
      {toolAuthEnabled ? (
        <SettingsSection title="Connected tools">
          {TOOL_AUTH_TOOLS.map((meta) => (
            <ConnectedToolCard key={meta.tool} meta={meta} />
          ))}
        </SettingsSection>
      ) : null}
      {jiraEnabled ? <JiraConnectionSettings /> : null}
    </SettingsPageContainer>
  );
}
