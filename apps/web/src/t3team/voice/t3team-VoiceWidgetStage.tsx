import { VOICE_WIDGET_EXIT_MS } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import { AnimatedHeight } from "./surface/t3team-AnimatedHeight";
import { VoiceHeardCard } from "./surface/t3team-VoiceHeardCard";
import { VoiceRecordingCard } from "./surface/t3team-VoiceRecordingCard";
import { useExpandPresence } from "./surface/t3team-useExpandPresence";
import { useFaceTransition } from "./surface/t3team-useFaceTransition";
import { VOICE_CLASS } from "./surface/t3team-voiceClasses";
import { voiceUiIsLive } from "./surface/t3team-voiceUiModel";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { FrozenVoiceViewProvider, type VoiceUiView } from "./surface/t3team-voiceView";
import "~/t3team/voice/surface/t3team-voice.css";

/** The last view the widget was open on, kept so the card does not change its face while it leaves. */
function useLastOpenView(open: boolean): VoiceUiView | null {
  const snapshot = useVoiceUiStore((store) => store.snapshot);
  const controls = useVoiceUiStore((store) => store.controls);
  const last = useRef<VoiceUiView | null>(null);
  useEffect(() => {
    if (open) last.current = { snapshot, controls, live: useVoiceUiStore.getState().live };
  }, [open, snapshot, controls]);
  return open ? null : last.current;
}

/**
 * The floating widget's card with every transition eased: it eases in and out as a whole, a
 * change of face (recording to heard) cross-fades, and a change of height follows its content.
 */
export function VoiceWidgetStage(props: {
  readonly keys: readonly string[];
  /** Keeps the widget closed even while a recording is live (the browser, while its tab is in front). */
  readonly suppressed?: boolean;
}) {
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const open = voiceUiIsLive(state) && props.suppressed !== true;
  const frozen = useLastOpenView(open);
  const { mounted, expanded } = useExpandPresence(open, VOICE_WIDGET_EXIT_MS);
  const shownState = frozen?.snapshot.state ?? state;
  const faces = useFaceTransition(shownState === "committed" ? "heard" : "recording");

  if (!mounted) return null;
  return (
    <div
      data-testid="voice-widget"
      data-expanded={expanded ? "" : undefined}
      className={cn(VOICE_CLASS.scope, VOICE_CLASS.widget)}
    >
      <FrozenVoiceViewProvider view={frozen}>
        <AnimatedHeight>
          {faces.map((face) => (
            <div key={face.key} className={VOICE_CLASS.face} data-phase={face.phase}>
              {face.key === "heard" ? (
                <VoiceHeardCard compact />
              ) : (
                <VoiceRecordingCard keys={props.keys} compact ambient />
              )}
            </div>
          ))}
        </AnimatedHeight>
      </FrozenVoiceViewProvider>
    </div>
  );
}
