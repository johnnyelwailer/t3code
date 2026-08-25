/**
 * ComposerVoiceInput - mic button for the chat composer footer.
 *
 * Uses the shared VoiceInputController to transcribe speech into
 * the composer text field via the Web Speech API.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceInputController } from "@t3tools/shared/voiceInput";
import { cn } from "../../lib/cn";

export interface ComposerVoiceInputProps {
  onTranscript: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ComposerVoiceInput({
  onTranscript,
  onPartialTranscript,
  disabled = false,
  className,
}: ComposerVoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const controllerRef = useRef<VoiceInputController | null>(null);
  const accumulatedRef = useRef("");

  useEffect(() => {
    const Ctor =
      typeof window !== "undefined"
        ? window.SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (!Ctor) setSupported(false);
    return () => {
      controllerRef.current?.cancel();
      controllerRef.current = null;
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!controllerRef.current) {
      controllerRef.current = new VoiceInputController(
        {
          onStateChange: (state) => {
            if (state === "recording") setIsRecording(true);
            else setIsRecording(false);
          },
          onFinalTranscript: (text) => {
            accumulatedRef.current += text;
            onPartialTranscript?.(accumulatedRef.current);
          },
          onPartialTranscript: (text) => {
            onPartialTranscript?.(accumulatedRef.current + text);
          },
          onError: () => setIsRecording(false),
        },
        { singleUtterance: false },
      );
    }
    accumulatedRef.current = "";
    controllerRef.current.start();
  }, [onPartialTranscript]);

  const stopRecording = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.stop();
    const full = controller.finalTranscript || accumulatedRef.current;
    if (full.trim()) onTranscript(full.trim());
    accumulatedRef.current = "";
  }, [onTranscript]);

  const toggle = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    if (!isRecording) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        controllerRef.current?.cancel();
        setIsRecording(false);
        accumulatedRef.current = "";
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRecording]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
        isRecording
          ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/30 animate-pulse"
          : "text-secondary-label hover:bg-accent hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed",
        className,
      )}
      aria-label={isRecording ? "Stop recording" : "Start voice input"}
      title={isRecording ? "Stop recording" : "Voice input"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    </button>
  );
}

export default ComposerVoiceInput;