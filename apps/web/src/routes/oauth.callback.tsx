import { createFileRoute } from "@tanstack/react-router";

import { OAuthCallbackPage } from "~/t3work/components/t3work-OAuthCallbackPage";

export const Route = createFileRoute("/oauth/callback")({
  component: OAuthCallbackPage,
});
