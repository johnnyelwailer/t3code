import { Navigate } from "@tanstack/react-router";

import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import { SettingsPageContainer } from "./settingsLayout";
import { FeatureFlagGroup } from "./t3team-FeatureFlagGroup";
import { groupFeatureFlags } from "./t3team-featureFlagsSettings.logic";
import {
  useFeatureFlagsSettings,
  type FeatureFlagsSettingsController,
} from "./t3team-useFeatureFlagsSettings";

export function FeatureFlagsSettings({
  controller,
}: {
  readonly controller: FeatureFlagsSettingsController;
}) {
  const { view, loadError, canEdit, pending, errors, setEnabled, reset } = controller;
  if (view === null) {
    return (
      <p role={loadError === null ? "status" : "alert"} className="px-3 text-sm sm:px-4">
        {loadError ?? "Loading feature switches…"}
      </p>
    );
  }
  const state = {
    preset: view.preset,
    canEdit,
    pending,
    errors,
    onSetEnabled: setEnabled,
    onReset: reset,
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="px-3 text-xs text-muted-foreground sm:px-4">
        An env override wins over your choice, your choice over the release preset, the preset over
        the default.
      </p>
      {groupFeatureFlags(view).map((section) => (
        <FeatureFlagGroup key={section.group} section={section} state={state} />
      ))}
    </div>
  );
}

function FeatureFlagsSettingsPanel() {
  return <FeatureFlagsSettings controller={useFeatureFlagsSettings()} />;
}

export function FeatureFlagsSettingsPage() {
  if (!useFeatureFlag("SETTINGS_FEATURES_PAGE")) {
    return <Navigate to="/settings/general" replace />;
  }
  return (
    <SettingsPageContainer>
      <FeatureFlagsSettingsPanel />
    </SettingsPageContainer>
  );
}
