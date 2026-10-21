import { createFileRoute } from "@tanstack/react-router";

import { VoiceWidgetView } from "~/t3team/voice/t3team-VoiceWidgetView";

/**
 * The floating voice widget's page (`VOICE_WIDGET_ROUTE_PATH`), loaded only by the desktop widget
 * window. A top-level route the root renders bare: it needs no sign-in of its own, since
 * everything it shows arrives over the desktop bridge from the main window.
 */
export const Route = createFileRoute("/t3team-voice-widget")({
  component: VoiceWidgetView,
});
