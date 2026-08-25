import { AUTO_SEND_PAUSE_MS, SILENCE_ENERGY_THRESHOLD, type StopMode } from "./types.ts";

/**
 * Decides when a silence pause is long enough to auto-send.
 *
 * Feed it the average waveform energy once per frame; it remembers the last
 * time audio was present and answers true when the silence threshold for the
 * active mode is exceeded.
 */
export class SilenceAutoStop {
  private currentMode: StopMode;
  private lastAudioTime = 0;

  constructor(mode: StopMode) {
    this.currentMode = mode;
  }

  /** Prime the silence clock (call once when the recording begins). */
  prime(now: number): void {
    this.lastAudioTime = now;
  }

  setMode(mode: StopMode): void {
    this.currentMode = mode;
  }

  get mode(): StopMode {
    return this.currentMode;
  }

  /** @returns true when the silence threshold for the active mode is exceeded. */
  observe(avgEnergy: number, now: number): boolean {
    if (this.currentMode === "manual") return false;
    if (avgEnergy < SILENCE_ENERGY_THRESHOLD) {
      return now - this.lastAudioTime >= AUTO_SEND_PAUSE_MS[this.currentMode];
    }
    this.lastAudioTime = now;
    return false;
  }
}
