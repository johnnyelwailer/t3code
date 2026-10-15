/**
 * ComposerVoiceInput - full voice input with live waveform, language switch, and auto-send.
 *
 * The implementation lives in @t3tools/shared (packages/shared/src/voiceInputUi.tsx)
 * so nexi-work and nexi-portal share ONE source of truth for the voice UI.
 *
 * Host gate: Chromium's Web Speech API does not work inside Electron (GHE #232), so in the
 * desktop app the mic only shows when the native transcription bridge reports a working engine
 * (macOS Speech, Windows speech, or a configured custom engine). In browsers nothing changes.
 */
import { useEffect, useState } from "react";

import {
  ComposerVoiceInput as SharedComposerVoiceInput,
  getNativeTranscriptionBridge,
  type ComposerVoiceInputProps,
} from "@t3tools/shared/voiceInputUi";

import { isElectron } from "../../env";

/** null while probing; true/false once the desktop bridge answered. */
export function useDesktopVoiceAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    const bridge = getNativeTranscriptionBridge();
    if (!bridge) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    bridge.getStatus().then(
      (status) => {
        if (cancelled) return;
        if (!status.available) {
          const reasons = status.engines
            .map((e) => `${e.id}: ${e.reason ?? "unavailable"}`)
            .join("; ");
          console.info(
            `[voice-input] no desktop speech-to-text engine available (${reasons || "none registered"})`,
          );
        }
        setAvailable(status.available);
      },
      (error: unknown) => {
        console.warn("[voice-input] desktop transcription status failed:", error);
        if (!cancelled) setAvailable(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

export function ComposerVoiceInput(props: ComposerVoiceInputProps) {
  const desktopAvailable = useDesktopVoiceAvailable();
  const hostAvailable = isElectron ? desktopAvailable === true : true;
  return (
    <SharedComposerVoiceInput {...props} available={hostAvailable && props.available !== false} />
  );
}
