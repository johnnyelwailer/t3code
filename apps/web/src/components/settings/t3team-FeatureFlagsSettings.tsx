import { Navigate } from "@tanstack/react-router";
import { useState } from "react";

import { FeatureFlagGroup } from "./t3team-FeatureFlagGroup";
import { groupFeatureFlags } from "./t3team-featureFlagsSettings.logic";
import type { FeatureFlagsSettingsController } from "./t3team-useFeatureFlagsSettings";

export function FeatureFlagsSettings({
  controller,
  now: fixedNow,
}: {
  readonly controller: FeatureFlagsSettingsController;
  /** Pins which flags count as New; stories fix it so the baseline does not age. */
  readonly now?: Date;
}) {
  const [openedAt] = useState(() => new Date());
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
    now: fixedNow ?? openedAt,
    pending,
    errors,
    onSetEnabled: setEnabled,
    onReset: reset,
  };
  return (
    <div className="flex flex-col gap-4">
      {groupFeatureFlags(view).map((section) => (
        <FeatureFlagGroup key={section.group} section={section} state={state} />
      ))}
    </div>
  );
}

/** Features and upstream's Labs are one page now; old links and group anchors land there. */
export function FeatureFlagsSettingsPage() {
  return <Navigate to="/settings/labs" search hash replace />;
}
