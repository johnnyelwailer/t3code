import { createFileRoute } from "@tanstack/react-router";

import { OAuthCallbackPage } from "~/t3team/components/t3team-OAuthCallbackPage";

export const Route = createFileRoute("/oauth/callback")({
  component: OAuthCallbackPage,
});
