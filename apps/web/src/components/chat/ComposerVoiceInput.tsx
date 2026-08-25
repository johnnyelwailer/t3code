/**
 * ComposerVoiceInput - mic button for the chat composer footer.
 *
 * Uses the shared VoiceInputController to transcribe speech via the Web
 * Speech API; the accumulated transcript is inserted into the composer when
 * recording stops.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceInputController } from "@t3tools/shared/voiceInput";
import { cn } from "../../lib/utils";

export interface ComposerVoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ComposerVoiceInput({
  onTranscript,
  disabled = false,
  className,
}: ComposerVoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const controllerRef = useRef<VoiceInputController | null>(null);

  useEffect(() => {
    const controller = new VoiceInputController({
      onStateChange: (state) => setIsRecording(state === "recording"),
    });
    controllerRef.current = controller;
    setIsSupported(controller.supported);
    return () => {
      controller.cancel();
      controllerRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (controller.state === "recording") {
      controller.stop();
      const transcript = controller.finalTranscript.trim();
      if (transcript) onTranscript(transcript);
    } else {
      controller.start();
    }
  }, [onTranscript]);

  useEffect(() => {
    if (!isRecording) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      controllerRef.current?.cancel();
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [isRecording]);

  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={isRecording ? "Stop recording" : "Start voice input"}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full transition-all duration-200",
        isRecording
          ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/30 animate-pulse"
          : "text-secondary-label hover:bg-accent hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed",
        className,
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    </button>
  );
}
