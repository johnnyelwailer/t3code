import { useEffect, useState } from "react";

import { ComposerBanner } from "~/components/chat/ComposerBanner";
import { cn } from "~/lib/utils";
import { VoiceNote } from "./surface/t3team-VoiceNote";
import { VoiceRecordingCard } from "./surface/t3team-VoiceRecordingCard";
import { useExpandPresence } from "./surface/t3team-useExpandPresence";
import { useVoiceHotkeyKeys } from "./surface/t3team-useVoiceHotkeyKeys";
import { VOICE_CLASS } from "./surface/t3team-voiceClasses";
import type { VoiceUiState } from "./surface/t3team-voiceUiModel";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { useIsVoiceThread } from "./t3team-useIsVoiceThread";
import "~/t3team/voice/surface/t3team-voice.css";

type DockState = "preparing" | "recording" | "transcribing" | "denied" | "failed";

const isDockState = (state: VoiceUiState): state is DockState =>
  state === "preparing" ||
  state === "recording" ||
  state === "transcribing" ||
  state === "denied" ||
  state === "failed";

/** The last dock state, so the dock keeps its face while it collapses after the commit. */
function useHeldDockState(state: VoiceUiState): DockState | null {
  const [held, setHeld] = useState<DockState | null>(isDockState(state) ? state : null);
  useEffect(() => {
    if (isDockState(state)) setHeld(state);
  }, [state]);
  return isDockState(state) ? state : held;
}

/** The last non-empty transcript of the open dock, so the collapsing dock keeps what was said. */
function useHeldTranscript(open: boolean): string {
  const partial = useVoiceUiStore((store) => store.live.partial);
  const [held, setHeld] = useState(partial);
  useEffect(() => {
    if (open || partial !== "") setHeld(partial);
  }, [open, partial]);
  return open ? partial : held;
}

/**
 * The voice thread's composer grows into the live recording: an attachment above the composer
 * that expands when recording starts and collapses on commit, where the heard text becomes the
 * thread's next message. A blocked microphone, a model download or a miss use the same dock.
 */
export function VoiceComposerDock(props: {
  readonly environmentId: string;
  readonly threadId: string | null;
}) {
  const isVoiceThread = useIsVoiceThread(props.environmentId, props.threadId);
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const hasRecorder = useVoiceUiStore((store) => store.controls !== null);
  const keys = useVoiceHotkeyKeys();
  const face = useHeldDockState(state);
  const open = isVoiceThread && hasRecorder && isDockState(state);
  const transcript = useHeldTranscript(open);
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
              {face === "recording" || face === "transcribing" ? (
                <VoiceRecordingCard keys={keys} docked transcript={transcript} />
              ) : (
                <VoiceNote state={face} docked />
              )}
            </div>
          </ComposerBanner.Root>
        </ComposerBanner.Attachment>
      </div>
    </div>
  );
}
