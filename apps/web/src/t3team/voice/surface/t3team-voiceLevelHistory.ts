const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Seconds the displayed level takes to follow a louder / quieter input. */
const ATTACK_SECONDS = 0.035;
const RELEASE_SECONDS = 0.15;

/**
 * The input loudness as the eye should see it: it rises fast and falls slowly, and the last
 * stretch of it is kept so a waveform can draw the recent past. `at(0)` is the oldest sample,
 * `at(1)` the newest.
 */
export class VoiceLevelHistory {
  private readonly samples: Float32Array;
  private head = 0;
  private level = 0;

  constructor(size = 96) {
    this.samples = new Float32Array(size);
  }

  get current(): number {
    return this.level;
  }

  /** Moves the displayed level toward `input` over `dtSeconds` and records it. */
  step(input: number, dtSeconds: number): number {
    const target = clamp(input, 0, 1);
    const tau = target > this.level ? ATTACK_SECONDS : RELEASE_SECONDS;
    this.level += (target - this.level) * (1 - Math.exp(-dtSeconds / tau));
    this.samples[this.head] = this.level;
    this.head = (this.head + 1) % this.samples.length;
    return this.level;
  }

  at(position: number): number {
    const size = this.samples.length;
    const fraction = clamp(position, 0, 1) * (size - 1);
    const index = Math.floor(fraction);
    const blend = fraction - index;
    const older = this.samples[(this.head + index) % size] ?? 0;
    const newer = this.samples[(this.head + Math.min(index + 1, size - 1)) % size] ?? 0;
    return older + (newer - older) * blend;
  }
}
