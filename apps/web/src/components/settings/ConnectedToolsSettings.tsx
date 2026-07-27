"use client";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { useToolAuthActions, useToolAuthStates } from "../../state/toolauth";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { ToolAuthCard } from "./ToolAuthCard";
import { TOOL_AUTH_TOOLS, type ToolAuthToolMeta } from "./toolAuthTools";

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

export function ConnectedToolsSettings() {
  return (
    <SettingsPageContainer>
      <SettingsSection title="Connected tools">
        {TOOL_AUTH_TOOLS.map((meta) => (
          <ConnectedToolCard key={meta.tool} meta={meta} />
        ))}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
