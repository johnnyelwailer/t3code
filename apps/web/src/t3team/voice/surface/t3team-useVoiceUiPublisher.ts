import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";
import { useEffect } from "react";

import { VOICE_COMMITTED_SETTLE_MS } from "./t3team-voiceUiModel";
import {
  dispatchVoiceUi,
  IDLE_VOICE_LIVE,
  useVoiceUiStore,
  type VoiceUiControls,
  type VoiceUiLive,
} from "./t3team-voiceUiStore";

export interface VoiceUiPublication {
  readonly phase: VoiceInputPhase;
  readonly errorAction: "retry" | "settings" | null;
  readonly error: string | null;
  readonly downloadPercent: number | null;
  readonly sessionId: () => string | null;
  /** Level and partial transcript, when the owner has them as values (the web owner pushes them itself). */
  readonly live?: VoiceUiLive;
  readonly controls: VoiceUiControls | null;
}

/**
 * Publishes the recorder that owns this window into the shared voice view, and settles a
 * committed utterance back to idle after its "heard" moment.
 */
export function useVoiceUiPublisher(input: VoiceUiPublication): void {
  const { phase, errorAction, error, downloadPercent, sessionId, live, controls } = input;

  useEffect(() => {
    dispatchVoiceUi({
      type: "phase",
      phase,
      errorAction,
      error,
      sessionId: sessionId(),
      now: Date.now(),
    });
    if (phase !== "recording" && phase !== "transcribing") {
      useVoiceUiStore.getState().setLive(IDLE_VOICE_LIVE);
    }
  }, [phase, errorAction, error, sessionId]);

  useEffect(
    () => dispatchVoiceUi({ type: "download", percent: downloadPercent }),
    [downloadPercent],
  );

  useEffect(() => {
    if (live !== undefined) useVoiceUiStore.getState().setLive(live);
  }, [live]);

  useEffect(() => {
    useVoiceUiStore.getState().setControls(controls);
    return () => {
      useVoiceUiStore.getState().setControls(null);
      useVoiceUiStore.getState().setLive(IDLE_VOICE_LIVE);
    };
  }, [controls]);

  const committed = useVoiceUiStore((store) => store.snapshot.state === "committed");
  const heardText = useVoiceUiStore((store) => store.snapshot.heardText);
  useEffect(() => {
    if (!committed) return;
    const timer = window.setTimeout(
      () => dispatchVoiceUi({ type: "settle" }),
      VOICE_COMMITTED_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [committed, heardText]);
}
