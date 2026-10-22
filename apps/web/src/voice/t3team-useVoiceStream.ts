import { sanitizeTranscript } from "@t3tools/client-runtime/voice-input";
import type { DesktopVoiceWarmupStage, VoiceTranscriptMetadata } from "@t3tools/contracts";
import { useEffect, useRef, useState, type RefObject } from "react";

export type VoiceStreamHeard = {
  readonly text: string;
  /** Epoch ms the utterance's text arrived. */
  readonly atMs: number;
};

export type VoiceStreamView = {
  /** 0-1 input loudness of the latest chunk. */
  readonly level: number;
  /** What the utterance in progress says so far, with no-speech markers and known hallucinations removed. */
  readonly partial: string;
  /** How many committed utterances are still being written down; the recording stays open meanwhile. */
  readonly writing: number;
  /** Epoch ms the oldest of those was committed, so the surfaces can count how long it has taken. */
  readonly writingSinceMs: number | null;
  /** The latest utterance that came back with words in it. */
  readonly heard: VoiceStreamHeard | null;
  /** The speech model is loading or warming up; speech said meanwhile is kept and written down once it is ready. */
  readonly warmup: VoiceStreamWarmup | null;
};

export type VoiceStreamWarmup = {
  readonly stage: Exclude<DesktopVoiceWarmupStage, "ready">;
  readonly percent: number;
};

const IDLE_VIEW: VoiceStreamView = {
  level: 0,
  partial: "",
  writing: 0,
  writingSinceMs: null,
  heard: null,
  warmup: null,
};

function writingDone(view: VoiceStreamView): Pick<VoiceStreamView, "writing" | "writingSinceMs"> {
  const writing = Math.max(0, view.writing - 1);
  return { writing, writingSinceMs: writing === 0 ? null : view.writingSinceMs };
}

type VoiceStreamHandlers = {
  readonly sessionIdRef: RefObject<string | null>;
  /** The speaker paused for good (said nothing, or went quiet after the last utterance): end the recording. */
  readonly onSessionEnd: () => void;
  readonly onLanguage: (language: string) => void;
  /** One utterance came back written down, with words in it, and whisper's metadata for it. */
  readonly onUtterance: (text: string, metadata?: VoiceTranscriptMetadata) => void;
  readonly onUtteranceFailed: (message: string) => void;
};

/**
 * Live data of the recording session that owns `sessionIdRef`: loudness, the transcript of the
 * utterance in progress, how many utterances are being written down, the language the session
 * locked to, and the main process's calls: an utterance's text, or the end of the session. Events
 * of any other session, or from before the recording began, are ignored.
 */
export function useVoiceStream(
  input: { readonly active: boolean } & Partial<VoiceStreamHandlers> &
    Pick<VoiceStreamHandlers, "sessionIdRef">,
): VoiceStreamView {
  const [view, setView] = useState(IDLE_VIEW);
  const callbacks = useRef(input);
  useEffect(() => {
    callbacks.current = input;
  });

  useEffect(() => {
    const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
    if (!input.active || !bridge?.onVoiceStream) return;
    const unsubscribe = bridge.onVoiceStream((event) => {
      const handlers = callbacks.current;
      if (event.sessionId !== handlers.sessionIdRef.current) return;
      switch (event.type) {
        case "level":
          return setView((current) => ({ ...current, level: event.level }));
        case "partial":
          return setView((current) => ({ ...current, partial: sanitizeTranscript(event.text) }));
        case "language":
          return handlers.onLanguage?.(event.language);
        case "auto-commit":
          if (event.reason !== "silence") return handlers.onSessionEnd?.();
          return setView((current) => ({
            ...current,
            partial: "",
            writing: current.writing + 1,
            writingSinceMs: current.writingSinceMs ?? Date.now(),
          }));
        case "utterance": {
          const text = sanitizeTranscript(event.text);
          setView((current) => ({
            ...current,
            ...writingDone(current),
            heard: text === "" ? current.heard : { text, atMs: Date.now() },
          }));
          return text === "" ? undefined : handlers.onUtterance?.(text, event.metadata);
        }
        case "utterance-failed":
          setView((current) => ({ ...current, ...writingDone(current) }));
          return handlers.onUtteranceFailed?.(event.message);
        case "warmup": {
          const { stage, percent } = event;
          return setView((current) =>
            stage === "ready"
              ? current.warmup === null
                ? current
                : { ...current, warmup: null }
              : current.warmup?.stage === stage
                ? current
                : { ...current, warmup: { stage, percent } },
          );
        }
      }
    });
    return () => {
      unsubscribe();
      setView(IDLE_VIEW);
    };
  }, [input.active]);

  return view;
}
