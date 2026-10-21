import { VoiceWidgetStage } from "./t3team-VoiceWidgetStage";
import { useAppInBackground } from "./t3team-useAppInBackground";

/**
 * The browser's floating widget: a page cannot draw outside its tab, so this shows in the
 * corner only while the tab is visible but another window has focus. The desktop has a window
 * of its own for this instead.
 */
export function WebVoiceWidget() {
  const background = useAppInBackground();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 w-98">
      <VoiceWidgetStage keys={[]} suppressed={!background} />
    </div>
  );
}
