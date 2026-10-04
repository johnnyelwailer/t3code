import { useEffect } from "react";

import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";

import { CloudSessionProvisionPanel } from "../cloud/t3team-CloudSessionProvisionPanel";

/**
 * Cloud computers in the welcome wizard: the same panel and controller as Settings → Connections,
 * so starting a cloud session and connecting to it work the same way in both places.
 */
export function WelcomeCloudSessions() {
  const cloud = useCloudSessionController();
  const { onPanelVisibilityChange } = cloud;
  // The list polls only while a surface shows it; the wizard shows it while this step is open.
  useEffect(() => {
    onPanelVisibilityChange(true);
    return () => onPanelVisibilityChange(false);
  }, [onPanelVisibilityChange]);

  if (!cloud.available) return null;
  if (!cloud.configured) {
    return (
      <p className="px-3 pb-3 text-muted-foreground text-xs">
        Cloud sessions need the GitHub CLI signed in on this computer.
      </p>
    );
  }
  return (
    <div className="pb-3">
      <CloudSessionProvisionPanel
        sessions={cloud.sessions}
        loading={cloud.loading}
        createPending={cloud.createPending}
        durationSeconds={cloud.durationSeconds}
        onDurationChange={cloud.onDurationChange}
        onCreate={cloud.onCreate}
        onSessionAction={cloud.onSessionAction}
        onSessionSecondaryAction={cloud.onSessionSecondaryAction}
        pendingSessionId={cloud.pendingSessionId}
        pendingKind={cloud.pendingKind}
        pendingLabel={cloud.pendingLabel}
        historyUrl={cloud.historyUrl}
      />
    </div>
  );
}
