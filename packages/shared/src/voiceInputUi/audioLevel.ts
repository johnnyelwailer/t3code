import {
  animateBars,
  attachAudioLevel,
  type WaveformBars,
  type WaveformFrame,
} from "./waveform.ts";
import { BAR_COUNT } from "./types.ts";

export interface VoiceBarsOptions {
  /** Null selects the CSS fallback animation directly. */
  audioContext: AudioContext | null;
  bars: () => WaveformBars;
  barCount?: number;
  /** Clock for the idle-drift phase (injected at the call site). */
  clock: () => number;
  onEnergy?: (level: number) => void;
  /** Reporting hook for analyser failures (CSS fallback start or frame errors). */
  onFrameError?: (error: unknown) => void;
  /**
   * CSS fallback frame provider (typically
   * `() => frameFromClock(clock(), barCount)`).
   */
  cssFrame: () => WaveformFrame;
}

/**
 * Start the live waveform for a recording: analyser-driven when the audio
 * context (and microphone) are available, CSS fallback otherwise.
 * Returns a stop function.
 */
export function startVoiceBars(options: VoiceBarsOptions): () => void {
  const barCount = options.barCount ?? BAR_COUNT;
  const animate = (frame: () => WaveformFrame): (() => void) =>
    animateBars({
      bars: options.bars,
      barCount,
      clock: options.clock,
      frame,
      ...(options.onEnergy ? { onEnergy: options.onEnergy } : {}),
      ...(options.onFrameError ? { onFrameError: options.onFrameError } : {}),
    });
  const cssStop = (): (() => void) => animate(options.cssFrame);
  if (!options.audioContext) return cssStop();

  const audioCtx = options.audioContext;
  let running: (() => void) | null = null;
  let settled = false;
  attachAudioLevel(audioCtx, barCount)
    .then(async (frame) => {
      if (audioCtx.state !== "running") {
        // Suspended context produces flat analyser data (dead bars, no
        // energy for auto-send) — resume before the first frame.
        await audioCtx.resume();
      }
      return frame;
    })
    .then((frame) => {
      if (settled) return;
      running = animate(frame);
    })
    .catch((error: unknown) => {
      if (settled) return;
      options.onFrameError?.(error);
      running = cssStop();
    });
  return () => {
    settled = true;
    running?.();
  };
}
