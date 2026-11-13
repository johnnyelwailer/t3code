/**
 * The turn-taking of a `ModelStageClipPool`: which pool clip plays next and for how many loops.
 * Pure (the randomness comes in as an argument), so the rules are tested without a mixer.
 */
import type { ModelStageClipPool, ModelStageClips } from "@t3team/pack-ui/contract";

const DEFAULT_LOOPS = [1, 2] as const;
export const DEFAULT_POOL_CROSSFADE_SECONDS = 0.5;

export function isClipPool(clips: ModelStageClips | undefined): clips is ModelStageClipPool {
  return typeof clips === "object" && !Array.isArray(clips) && "pool" in clips;
}

export interface PoolTurn {
  readonly name: string;
  readonly loops: number;
}

export class ClipPool {
  readonly crossfade: number;
  private readonly names: ReadonlyArray<string>;
  private readonly loops: readonly [number, number];
  private last: string | null = null;

  constructor(
    pool: ModelStageClipPool,
    available: (name: string) => boolean,
    private readonly random: () => number,
  ) {
    this.names = [...new Set(pool.pool)].filter(available);
    const [low, high] = pool.loops ?? DEFAULT_LOOPS;
    this.loops = [Math.max(1, Math.round(low)), Math.max(1, Math.round(high))];
    this.crossfade = pool.crossfade ?? DEFAULT_POOL_CROSSFADE_SECONDS;
  }

  get playable(): boolean {
    return this.names.length > 0;
  }

  /** A single clip never takes turns: it loops until the pool is replaced. */
  get alternates(): boolean {
    return this.names.length > 1;
  }

  next(): PoolTurn {
    const options = this.names.filter((name) => name !== this.last);
    const pick = options.length > 0 ? options : this.names;
    const name = pick[Math.floor(this.random() * pick.length)] ?? this.names[0] ?? "";
    this.last = name;
    const [low, high] = this.loops;
    const loops = low + Math.floor(this.random() * (Math.max(low, high) - low + 1));
    return { name, loops };
  }
}
