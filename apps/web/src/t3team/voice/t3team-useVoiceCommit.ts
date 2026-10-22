import type { VoiceTranscriptMetadata } from "@t3tools/contracts";
import { useCallback } from "react";

import { toastManager } from "~/components/ui/toast";
import { voiceFailureMessage, type VoiceFailureCode } from "./t3team-voiceFailure";
import { submitVoiceUtterance } from "./t3team-voiceSession";
import { makeVoiceSessionDeps } from "./t3team-voiceSessionDeps";
import { dispatchVoiceUi } from "./surface/t3team-voiceUiStore";

export function notifyVoiceFailure(code: VoiceFailureCode, detail?: string): void {
  toastManager.add({
    type: "error",
    title: "Voice",
    description: voiceFailureMessage(code, detail),
  });
}

/**
 * Where a committed transcript goes: the surfaces learn it was heard, and the utterance is routed
 * to the voice thread. A failure to send is a toast, since what was heard is not the problem.
 */
export function useVoiceCommit(): (text: string, metadata?: VoiceTranscriptMetadata) => void {
  return useCallback((text, metadata) => {
    const utterance = text.trim();
    if (utterance === "") {
      dispatchVoiceUi({ type: "fail", detail: "No speech was detected." });
      return;
    }
    dispatchVoiceUi({ type: "commit", text: utterance, now: Date.now() });
    const deps = makeVoiceSessionDeps();
    if (deps === null) {
      notifyVoiceFailure("send-failed", "No server connection.");
      return;
    }
    void submitVoiceUtterance(deps, utterance, metadata).then((result) => {
      if (result.status === "sent") dispatchVoiceUi({ type: "tier", tier: result.tier });
      else notifyVoiceFailure(result.code, result.detail);
    });
  }, []);
}
