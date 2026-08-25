/**
 * Waveform rendering: six bars driven per-frame from a normalized voice
 * level. Bars always show a slow idle drift (so they never look dead);
 * the live voice level adds amplitude on top.
 */
export interface WaveformFrame {
  /** Normalized voice level 0..1 for this frame. */
  level: number;
}

/** Sparse map of bar index -> element. */
export interface WaveformBars {
  readonly [index: number]: HTMLSpanElement | null;
}

const IDLE_BASE_PX = 3.2;
const IDLE_AMPLITUDE_PX = 2.2;
const IDLE_PERIOD_MS = 1500;
const VOICE_AMPLITUDE_PX = 18;

/** Compute the next target frame from raw analyser samples. */
export function frameFromAudioLevel(
  buffer: Uint8Array<ArrayBuffer>,
  barCount: number,
): WaveformFrame {
  let energy = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = ((buffer[i] ?? 128) - 128) / 128;
    energy += v * v;
  }
  energy /= buffer.length;
  void barCount;
  return { level: Math.min(1, energy * 4) };
}

/**
 * Gentle clock-driven level for the CSS fallback path (no analyser):
 * the bars still get their idle drift, this just adds a subtle pulse.
 */
export function frameFromClock(timeMs: number, barCount: number): WaveformFrame {
  void barCount;
  return { level: 0.05 * (1 + Math.sin(timeMs / 900)) };
}

export interface WaveformAnimatorOptions {
  bars: () => WaveformBars;
  barCount: number;
  /** Clock for the idle-drift phase (injected so this module stays timer-free). */
  clock: () => number;
  /** Produce the next level frame. */
  frame: () => WaveformFrame;
  /** Called with the raw level whenever the frame carries one. */
  onEnergy?: (level: number) => void;
  /** Called when frame() throws; the loop stops afterwards. */
  onFrameError?: (error: unknown) => void;
}

/**
 * Animate the bars: slow per-bar idle drift plus voice-amplitude wobble,
 * fast-attack/slow-release on the smoothed level. Returns a stop function.
 */
export function animateBars(options: WaveformAnimatorOptions): () => void {
  let raf: number | null = null;
  let levelSmooth = 0;

  const step = (): void => {
    let frame: WaveformFrame;
    try {
      frame = options.frame();
    } catch (error) {
      // A broken analyser must not kill the loop silently — report and stop.
      cancelAnimationFrame(raf!);
      options.onFrameError?.(error);
      return;
    }
    const now = options.clock();
    // Fast attack, slow release.
    levelSmooth =
      frame.level >= levelSmooth ? frame.level : levelSmooth + (frame.level - levelSmooth) * 0.25;
    for (let i = 0; i < options.barCount; i++) {
      const el = options.bars()[i];
      if (!el) continue;
      const idle =
        IDLE_BASE_PX + IDLE_AMPLITUDE_PX * (1 + Math.sin(now / IDLE_PERIOD_MS + i * 0.85));
      const voice =
        levelSmooth * VOICE_AMPLITUDE_PX * (0.4 + 0.6 * Math.abs(Math.sin(now / 260 + i * 0.9)));
      el.style.height = `${(idle + voice).toFixed(1)}px`;
    }
    if (options.onEnergy) options.onEnergy(frame.level);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return () => {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
  };
}

/** Reset the bars to their minimum resting height. */
export function resetBars(bars: WaveformBars, barCount: number): void {
  for (let i = 0; i < barCount; i++) {
    const el = bars[i];
    if (el) el.style.height = `${IDLE_BASE_PX}px`;
  }
}

/**
 * Attach an analyser to a media stream and return a live frame provider.
 * Resolves to `null` when no microphone stream is available (the caller
 * falls back to CSS-driven frames).
 */
export function attachAudioLevel(
  audioCtx: AudioContext,
  barCount: number,
): Promise<() => WaveformFrame> {
  const getUserMedia = () =>
    navigator.mediaDevices.getUserMedia({ audio: true }).catch((error: unknown) => {
      const err = error as { name?: string };
      if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        throw new Error("MicPermissionDenied");
      }
      throw error;
    });
  return getUserMedia().then((stream): (() => WaveformFrame) => {
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);
    return (): WaveformFrame => {
      analyser.getByteTimeDomainData(buffer);
      return frameFromAudioLevel(buffer, barCount);
    };
  });
}
