import { useEffect, useState } from "react";

import { ComposerBanner } from "~/components/chat/ComposerBanner";
import { cn } from "~/lib/utils";
import { VoiceNote } from "./surface/t3team-VoiceNote";
import { useExpandPresence } from "./surface/t3team-useExpandPresence";
import { VOICE_CLASS } from "./surface/t3team-voiceClasses";
import type { VoiceUiState } from "./surface/t3team-voiceUiModel";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { useIsVoiceThread } from "./t3team-useIsVoiceThread";
import "~/t3team/voice/surface/t3team-voice.css";

/** The live recording itself is not here: it is inline in the composer (`VoiceComposerInline`). */
type DockState = "preparing" | "denied" | "failed";

const isDockState = (state: VoiceUiState): state is DockState =>
  state === "preparing" || state === "denied" || state === "failed";

/** The last dock state, so the dock keeps its face while it collapses after the commit. */
function useHeldDockState(state: VoiceUiState): DockState | null {
  const [held, setHeld] = useState<DockState | null>(isDockState(state) ? state : null);
  useEffect(() => {
    if (isDockState(state)) setHeld(state);
  }, [state]);
  return isDockState(state) ? state : held;
}

/**
 * The voice thread's notices above the composer: a model download, a blocked microphone or a
 * miss. The recording itself streams inline in the composer, with no card of its own.
 */
export function VoiceComposerDock(props: {
  readonly environmentId: string;
  readonly threadId: string | null;
}) {
  const isVoiceThread = useIsVoiceThread(props.environmentId, props.threadId);
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const hasRecorder = useVoiceUiStore((store) => store.controls !== null);
  const face = useHeldDockState(state);
  const open = isVoiceThread && hasRecorder && isDockState(state);
  const { mounted, expanded } = useExpandPresence(open);

  if (!isVoiceThread || !mounted || face === null) return null;
  return (
    <div
      data-testid="voice-composer-dock"
      data-state={face}
      data-expanded={expanded ? "" : undefined}
      className={cn(VOICE_CLASS.scope, VOICE_CLASS.dock)}
    >
      <div>
        <ComposerBanner.Attachment className="w-full">
          <ComposerBanner.Root density="spacious">
            <div className="px-1 pb-4">
              <VoiceNote state={face} docked />
            </div>
          </ComposerBanner.Root>
        </ComposerBanner.Attachment>
      </div>
    </div>
  );
}
