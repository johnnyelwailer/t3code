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
  /** Reporting hook for analyser failures (the CSS loop keeps running). */
  onFrameError?: (error: unknown) => void;
  /** Called exactly once when the analyser takes over from the CSS loop. */
  onAudioActive?: () => void;
  /**
   * CSS fallback frame provider (typically
   * `() => frameFromClock(clock(), barCount)`).
   */
  cssFrame: () => WaveformFrame;
}

/**
 * Start the live waveform for a recording.
 *
 * CSS-first: the clock-driven loop starts immediately, so the bars are
 * alive from the first frame. When the analyser connects (or a suspended
 * context resumes), it takes over and the CSS loop stops. If the audio
 * path never comes up (permission prompt, flat context), the bars keep
 * drifting — visibly distinguishing "analyser dead" from "loop dead".
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

  let settled = false;
  let cssRunning: (() => void) | null = null;
  let audioRunning: (() => void) | null = null;

  const stopCss = (): void => {
    cssRunning?.();
    cssRunning = null;
  };
  const stopAudio = (): void => {
    audioRunning?.();
    audioRunning = null;
  };

  cssRunning = animate(options.cssFrame);
  if (options.audioContext) {
    const audioCtx = options.audioContext;
    attachAudioLevel(audioCtx, barCount)
      .then(async (frame) => {
        if (audioCtx.state !== "running") {
          // Suspended context produces flat analyser data (no level for the
          // bars or the auto-send detector) — resume before it takes over.
          await audioCtx.resume();
        }
        return frame;
      })
      .then((frame) => {
        if (settled) return;
        stopCss();
        audioRunning = animate(frame);
        options.onAudioActive?.();
      })
      .catch((error: unknown) => {
        if (settled) return;
        options.onFrameError?.(error);
      });
  }

  return () => {
    settled = true;
    stopCss();
    stopAudio();
  };
}
