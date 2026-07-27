import { createFileRoute } from "@tanstack/react-router";

import { ConnectedToolsSettings } from "../components/settings/t3team-ConnectedToolsSettings";

export const Route = createFileRoute("/settings/connected-tools")({
  component: ConnectedToolsSettings,
});
