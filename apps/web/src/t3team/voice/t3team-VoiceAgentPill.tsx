import { ComposerVoiceInput, type ComposerVoiceInputHandle } from "@t3tools/shared/voiceInputUi";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DesktopComposerVoiceInput,
  type DesktopVoiceInputHandle,
} from "../../components/chat/t3team-DesktopComposerVoiceInput";
import { isElectron } from "../../env";
import { voiceFailureMessage, type VoiceFailureCode } from "./t3team-voiceFailure";
import { submitVoiceUtterance } from "./t3team-voiceSession";
import { makeVoiceSessionDeps } from "./t3team-voiceSessionDeps";
import { useVoiceHotkey } from "./t3team-useVoiceHotkey";

type Notice =
  | { readonly kind: "heard"; readonly text: string }
  | { readonly kind: "failure"; readonly code: VoiceFailureCode; readonly detail?: string };

const NOTICE_MS = 8_000;

const noticeText = (notice: Notice) =>
  notice.kind === "heard"
    ? `Heard: “${notice.text}”`
    : voiceFailureMessage(notice.code, notice.detail);

/**
 * The persistent voice pill: owns the session, shows what was heard, and routes each committed
 * utterance to the global voice thread. Desktop transcribes on-device with whisper (Web Speech is
 * unreachable on-prem); the browser keeps the Web Speech input.
 */
export function T3TeamVoiceAgentPill() {
  const router = useRouter();
  const webVoiceRef = useRef<ComposerVoiceInputHandle>(null);
  const desktopVoiceRef = useRef<DesktopVoiceInputHandle>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onTranscript = useCallback(
    (text: string) => {
      const utterance = text.trim();
      if (utterance === "") {
        setNotice({ kind: "failure", code: "transcription-failed" });
        return;
      }
      setNotice({ kind: "heard", text: utterance });
      const deps = makeVoiceSessionDeps(router);
      if (deps === null) {
        setNotice({ kind: "failure", code: "send-failed", detail: "No server connection." });
        return;
      }
      void submitVoiceUtterance(deps, utterance).then((result) => {
        if (result.status === "error") {
          setNotice({ kind: "failure", code: result.code, detail: result.detail });
        }
      });
    },
    [router],
  );

  useVoiceHotkey({
    onToggle: () => (desktopVoiceRef.current ?? webVoiceRef.current)?.toggle(),
    onUnavailable: (detail) => setNotice({ kind: "failure", code: "hotkey-unavailable", detail }),
  });

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {notice !== null && (
        <p
          role="status"
          className="pointer-events-auto max-w-sm rounded-lg border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
        >
          {noticeText(notice)}
        </p>
      )}
      {isElectron ? (
        <DesktopComposerVoiceInput
          ref={desktopVoiceRef}
          className="pointer-events-auto"
          onTranscript={onTranscript}
          disabled={false}
        />
      ) : (
        <ComposerVoiceInput
          ref={webVoiceRef}
          className="pointer-events-auto"
          onTranscript={onTranscript}
          onStateChange={(state) => {
            if (state === "denied") setNotice({ kind: "failure", code: "mic-denied" });
          }}
        />
      )}
    </div>
  );
}
