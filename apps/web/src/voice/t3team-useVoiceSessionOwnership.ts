import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";
import { claimActiveRecording } from "@t3tools/shared/activeRecording";
import { useEffect, useRef, type RefObject } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";

interface OwnedVoiceController {
  readonly currentState: { readonly phase: VoiceInputPhase };
  ownerChanged(): void;
  stop(): Promise<void>;
  cancel(): void;
}

/**
 * Keeps one desktop recorder honest about who it records for.
 *
 * - Switching threads reuses the composer, so a change of `sessionKey` (the draft the transcript
 *   lands in) cancels the recording instead of letting it type into the next thread.
 * - The returned `syncSlot` is fed every controller phase; while the mic is held (preparing or
 *   recording) the recorder owns the app-wide recording slot, and a recorder that starts later
 *   ends this one. Its identity is stable, so it is safe in the controller's effect deps.
 */
export function useVoiceSessionOwnership(
  controllerRef: RefObject<OwnedVoiceController | null>,
  sessionKey: string | undefined,
) {
  const releaseSlotRef = useRef<(() => void) | null>(null);
  const ownerRef = useRef(sessionKey);

  useEffect(() => {
    if (ownerRef.current === sessionKey) return;
    ownerRef.current = sessionKey;
    controllerRef.current?.ownerChanged();
  }, [controllerRef, sessionKey]);

  return useStableCallback((phase: VoiceInputPhase) => {
    if (phase !== "preparing" && phase !== "recording") {
      releaseSlotRef.current?.();
      releaseSlotRef.current = null;
      return;
    }
    if (releaseSlotRef.current) return;
    releaseSlotRef.current = claimActiveRecording(() => {
      const controller = controllerRef.current;
      if (controller?.currentState.phase === "recording") void controller.stop();
      else controller?.cancel();
    });
  });
}
