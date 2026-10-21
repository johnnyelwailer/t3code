import { sanitizeTranscript } from "@t3tools/client-runtime/voice-input";
import { useEffect, useRef, useState, type RefObject } from "react";

export type VoiceStreamView = {
  /** 0-1 input loudness of the latest chunk. */
  readonly level: number;
  /** What was said so far, with no-speech markers and known hallucinations removed. */
  readonly partial: string;
};

const IDLE_VIEW: VoiceStreamView = { level: 0, partial: "" };

/**
 * Live data of the recording that owns `sessionIdRef`: loudness, the latest partial transcript,
 * the language the session locked to, and the main process's call to commit when the speaker
 * stopped. Events of any other session, or from before the recording began, are ignored.
 */
export function useVoiceStream(input: {
  readonly active: boolean;
  readonly sessionIdRef: RefObject<string | null>;
  readonly onAutoCommit: () => void;
  readonly onLanguage: (language: string) => void;
}): VoiceStreamView {
  const [view, setView] = useState(IDLE_VIEW);
  const callbacks = useRef(input);
  useEffect(() => {
    callbacks.current = input;
  });

  useEffect(() => {
    const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
    if (!input.active || !bridge?.onVoiceStream) return;
    const unsubscribe = bridge.onVoiceStream((event) => {
      const { sessionIdRef, onAutoCommit, onLanguage } = callbacks.current;
      if (event.sessionId !== sessionIdRef.current) return;
      if (event.type === "level") setView((current) => ({ ...current, level: event.level }));
      else if (event.type === "partial") {
        setView((current) => ({ ...current, partial: sanitizeTranscript(event.text) }));
      } else if (event.type === "language") onLanguage(event.language);
      else onAutoCommit();
    });
    return () => {
      unsubscribe();
      setView(IDLE_VIEW);
    };
  }, [input.active]);

  return view;
}
