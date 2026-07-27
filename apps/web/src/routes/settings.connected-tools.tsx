import { createFileRoute } from "@tanstack/react-router";

import { ConnectedToolsSettings } from "../components/settings/ConnectedToolsSettings";

export const Route = createFileRoute("/settings/connected-tools")({
  component: ConnectedToolsSettings,
});
