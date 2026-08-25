/**
 * ComposerVoiceInput - full voice input with live waveform, language switch, and auto-send.
 *
 * Shared UI component (one source of truth) consumed by BOTH nexi-work
 * (t3code web, via @t3tools/shared) and nexi-portal (via the Vite/tsconfig
 * alias to this file). Framework: React, no app-level imports — the class
 * joiner and the Web Speech globals are local to this file.
 *
 * States: idle -> waiting (permission) -> recording -> idle
 * Features:
 *   - 6-bar waveform driven by AudioContext + AnalyserNode (real-time)
 *   - Inline DE/FR/EN language switcher (visible only while recording)
 *   - Auto-send after N seconds of silence (configurable)
 *   - Bottom recording bar with stop button + mode toggle
 *   - Esc to cancel (discards transcript)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionLike,
  SpeechRecognitionWindow,
} from "./voiceInput.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal class joiner (the app-side `cn` equivalent, so this file stays app-import-free). */
function joinCls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComposerVoiceInputProps {
  onTranscript: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  onAutoSubmit?: () => void;
  disabled?: boolean;
  className?: string;
}

type VoiceState = "idle" | "waiting" | "recording" | "denied";
type StopMode = "manual" | "auto3" | "auto5";

const LANG_OPTIONS = [
  { code: "de-CH", label: "DE" },
  { code: "fr-CH", label: "FR" },
  { code: "en-US", label: "EN" },
] as const;

const BAR_COUNT = 6;
const LERP = 0.12;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ComposerVoiceInput({
  onTranscript,
  onPartialTranscript,
  onAutoSubmit,
  disabled = false,
  className,
}: ComposerVoiceInputProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [supported, setSupported] = useState(true);
  const [currentLang, setCurrentLang] = useState("en-US");
  const [stopMode, setStopMode] = useState<StopMode>("manual");
  const [stopMenuOpen, setStopMenuOpen] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const displayHeightsRef = useRef<number[]>(new Array(BAR_COUNT).fill(4));
  const barElsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const accumulatedRef = useRef("");
  const lastAudioTimeRef = useRef(0);

  // Detect support
  useEffect(() => {
    const win = window as SpeechRecognitionWindow;
    const Ctor =
      typeof window !== "undefined" ? win.SpeechRecognition || win.webkitSpeechRecognition : null;
    if (!Ctor) setSupported(false);
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Start
  const startRecording = useCallback(() => {
    setState("waiting");

    const win = window as SpeechRecognitionWindow;
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) {
      setState("denied");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = currentLang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    accumulatedRef.current = "";

    recognition.onresult = (ev: SpeechRecognitionEvent) => {
      let final = "";
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result) continue;
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        accumulatedRef.current += final;
        onPartialTranscript?.(accumulatedRef.current);
      }
    };

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        stopRecording(true);
      } else if (ev.error !== "no-speech") {
        stopRecording(false);
      }
    };

    recognition.onend = () => {
      if (state === "recording" && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          stopRecording(false);
        }
      }
    };

    recognitionRef.current = recognition;

    try {
      audioCtxRef.current = new AudioContext();
    } catch {
      /* CSS fallback */
    }

    try {
      recognition.start();
      setState("recording");
      lastAudioTimeRef.current = Date.now();
      startWaveform();
    } catch {
      setState("denied");
    }
  }, [currentLang, state, onPartialTranscript]);

  // Stop
  const stopRecording = useCallback(
    (cancelled: boolean, autoSubmit?: boolean) => {
      setState("idle");
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      displayHeightsRef.current = new Array(BAR_COUNT).fill(4);
      barElsRef.current.forEach((el) => {
        if (el) el.style.height = "4px";
      });

      if (cancelled) {
        accumulatedRef.current = "";
      } else {
        onTranscript(accumulatedRef.current);
        if (autoSubmit) onAutoSubmit?.();
      }
      accumulatedRef.current = "";
    },
    [onTranscript, onAutoSubmit],
  );

  // Waveform
  const startWaveform = useCallback(() => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx) {
      startCssBars();
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.92;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        const draw = () => {
          if (state !== "recording") return;
          analyser.getByteTimeDomainData(buf);
          const sliceLen = Math.floor(buf.length / BAR_COUNT);
          let totalEnergy = 0;

          for (let i = 0; i < BAR_COUNT; i++) {
            let peak = 0;
            for (let j = 0; j < sliceLen; j++) {
              const v = Math.abs((buf[i * sliceLen + j] ?? 0) - 128) / 128;
              if (v > peak) peak = v;
              totalEnergy += v;
            }
            const target = Math.max(4, Math.round(22 * Math.pow(peak, 0.6)));
            const prev = displayHeightsRef.current[i] ?? 4;
            displayHeightsRef.current[i] = prev + (target - prev) * LERP;
            const el = barElsRef.current[i];
            if (el) el.style.height = Math.round(displayHeightsRef.current[i] ?? 4) + "px";
          }

          // Auto-send
          if (stopMode !== "manual" && state === "recording") {
            const avgEnergy = totalEnergy / BAR_COUNT;
            const threshold = stopMode === "auto3" ? 3000 : 5000;
            if (avgEnergy < 0.02) {
              if (Date.now() - lastAudioTimeRef.current >= threshold) {
                stopRecording(false, true);
                return;
              }
            } else {
              lastAudioTimeRef.current = Date.now();
            }
          }

          rafRef.current = requestAnimationFrame(draw);
        };
        rafRef.current = requestAnimationFrame(draw);
      })
      .catch(() => startCssBars());
  }, [state, stopMode, stopRecording]);

  const startCssBars = useCallback(() => {
    const anim = () => {
      if (state !== "recording") return;
      for (let i = 0; i < BAR_COUNT; i++) {
        const target = Math.max(
          4,
          Math.round(22 * (Math.abs(Math.sin(Date.now() / 400 + i * 0.9)) * 0.7 + 0.15)),
        );
        const prev = displayHeightsRef.current[i] ?? 4;
        displayHeightsRef.current[i] = prev + (target - prev) * 0.1;
        const el = barElsRef.current[i];
        if (el) el.style.height = Math.round(displayHeightsRef.current[i] ?? 4) + "px";
      }
      rafRef.current = requestAnimationFrame(anim);
    };
    rafRef.current = requestAnimationFrame(anim);
  }, [state]);

  // Lang switch
  const switchLang = useCallback(
    (code: string) => {
      setCurrentLang(code);
      const oldRec = recognitionRef.current;
      if (!oldRec || state !== "recording") return;
      recognitionRef.current = null;
      oldRec.onend = null;
      oldRec.onerror = null;
      oldRec.onresult = null;
      try {
        oldRec.abort();
      } catch {}
      setTimeout(() => {
        if (state !== "recording") return;
        try {
          const win = window as SpeechRecognitionWindow;
          const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
          if (!Ctor) {
            stopRecording(false);
            return;
          }
          const rec = new Ctor();
          rec.lang = code;
          rec.continuous = true;
          rec.interimResults = true;
          rec.maxAlternatives = 1;
          rec.onresult = (ev: SpeechRecognitionEvent) => {
            let final = "";
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const result = ev.results[i];
              if (!result || !result.isFinal) continue;
              final += result[0].transcript;
            }
            if (final) {
              accumulatedRef.current += final;
              onPartialTranscript?.(accumulatedRef.current);
            }
          };
          rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
            if (ev.error !== "no-speech") stopRecording(false);
          };
          rec.onend = () => {
            if (state === "recording" && recognitionRef.current === rec) {
              try {
                rec.start();
              } catch {
                stopRecording(false);
              }
            }
          };
          recognitionRef.current = rec;
          rec.start();
        } catch {
          stopRecording(false);
        }
      }, 150);
    },
    [state, onPartialTranscript, stopRecording],
  );

  // Toggle
  const toggle = useCallback(() => {
    if (state === "recording") stopRecording(false);
    else startRecording();
  }, [state, startRecording, stopRecording]);

  // Esc
  useEffect(() => {
    if (state !== "recording") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopRecording(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, stopRecording]);

  if (!supported) return null;

  const isRecording = state === "recording";

  return (
    <div
      className={joinCls("flex items-center gap-2", className)}
      data-voice-input
      data-state={state}
    >
      {/* Lang group */}
      {isRecording && (
        <div className="flex items-center gap-0.5">
          {LANG_OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              className={joinCls(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider transition-colors",
                currentLang === opt.code
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground/40 hover:bg-white/5 hover:text-muted-foreground",
              )}
              onClick={(e) => {
                e.stopPropagation();
                switchLang(opt.code);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Mic button */}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={joinCls(
          "relative flex size-8 shrink-0 items-center justify-center rounded-full transition-all",
          state === "waiting" && "text-amber-500",
          isRecording && "text-red-500",
          state === "denied" && "cursor-not-allowed text-muted-foreground/30",
          state === "idle" && "text-muted-foreground hover:bg-accent hover:text-foreground",
          disabled && "opacity-40 cursor-not-allowed",
        )}
        aria-label={isRecording ? "Stop recording" : "Start voice input"}
      >
        <svg
          className={joinCls("transition-opacity", isRecording && "opacity-0")}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
        <div
          className={joinCls(
            "absolute inset-0 flex items-center justify-center gap-[2.5px] transition-opacity",
            isRecording ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <span
              key={i}
              ref={(el) => {
                barElsRef.current[i] = el;
              }}
              className="w-[3px] rounded-full bg-current"
              style={{ height: "4px" }}
            />
          ))}
        </div>
      </button>

      {/* Bottom recording bar */}
      {isRecording && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t border-border/50 bg-background px-6 py-3.5">
          <div className="relative flex items-center">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full bg-red-500 transition-transform hover:scale-105 active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                stopRecording(false);
              }}
              aria-label="Stop"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
            <button
              type="button"
              className="-ml-1 flex h-10 w-5 items-center justify-center rounded-r-md text-red-400/50 hover:bg-red-500/10 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                setStopMenuOpen(!stopMenuOpen);
              }}
              aria-label="Stop mode"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2 4l3 3 3-3" />
              </svg>
            </button>
            {stopMenuOpen && (
              <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg border border-border/50 bg-popover p-1 shadow-lg">
                {[
                  { mode: "manual" as StopMode, label: "Tap to interrupt" },
                  { mode: "auto3" as StopMode, label: "Auto-send after 3s pause" },
                  { mode: "auto5" as StopMode, label: "Auto-send after 5s pause" },
                ].map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    className={joinCls(
                      "block w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors",
                      stopMode === mode
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setStopMode(mode);
                      setStopMenuOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-sm font-medium">
            {stopMode === "manual"
              ? "Tap to interrupt"
              : stopMode === "auto3"
                ? "Auto-send (3s pause)"
                : "Auto-send (5s pause)"}
          </span>
        </div>
      )}
    </div>
  );
}

export default ComposerVoiceInput;
