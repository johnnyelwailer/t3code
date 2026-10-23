import { createFileRoute } from "@tanstack/react-router";

import { FeatureFlagsSettingsPage } from "../components/settings/t3team-FeatureFlagsSettings";

export const Route = createFileRoute("/settings/features")({
  component: FeatureFlagsSettingsPage,
});
