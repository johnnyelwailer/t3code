import { useEffect } from "react";

import { VoiceWidgetStage } from "./t3team-VoiceWidgetStage";
import { useVoiceWidgetBridge } from "./t3team-useVoiceWidgetBridge";
import "~/t3team/voice/surface/t3team-voice.css";

/**
 * The page of the floating voice widget window: transparent, the card anchored to the bottom
 * right so its glow has room around it. The desktop shows the window only while the app is in
 * the background.
 */
export function VoiceWidgetView() {
  const keys = useVoiceWidgetBridge();
  useEffect(() => {
    document.documentElement.dataset.t3teamVoiceWidget = "";
    return () => {
      delete document.documentElement.dataset.t3teamVoiceWidget;
    };
  }, []);
  return (
    <div className="fixed inset-0 flex items-end justify-end p-8">
      <div className="w-98">
        <VoiceWidgetStage keys={keys} />
      </div>
    </div>
  );
}
