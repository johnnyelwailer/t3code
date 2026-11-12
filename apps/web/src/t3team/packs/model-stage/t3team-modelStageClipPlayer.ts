/**
 * The clip half of `ModelStageScene`: one mixer, the clip sequence (each plays once, the last
 * loops), the one-shot a click plays, and the clip pool that takes turns between looping clips.
 * Clips are played by name; a change of clip crossfades. No timers: the pool advances on the
 * mixer's own `loop` events, so a paused or hidden stage costs nothing.
 */
import * as THREE from "three";
import type { ModelStageClips } from "@t3team/pack-ui/contract";

import { ClipPool, isClipPool } from "./t3team-modelStagePool";

const SEQUENCE_FADE_SECONDS = 0.3;

export class ModelStageClipPlayer {
  private mixer: THREE.AnimationMixer | null = null;
  private clips: ReadonlyArray<THREE.AnimationClip> = [];
  private sequence: ReadonlyArray<string> = [];
  private step = 0;
  private current: THREE.AnimationAction | null = null;
  private oneShot: THREE.AnimationAction | null = null;
  private pool: ClipPool | null = null;
  private loopsLeft = 0;

  constructor(
    private readonly onPlay: () => void,
    private readonly random: () => number = Math.random,
  ) {}

  get running(): boolean {
    return this.current?.isRunning() ?? false;
  }

  get currentName(): string | null {
    return this.current?.getClip().name ?? null;
  }

  bind(model: THREE.Object3D, clips: ReadonlyArray<THREE.AnimationClip>) {
    this.clips = clips;
    if (clips.length === 0) return;
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener("finished", (event) => this.finished(event.action));
    this.mixer.addEventListener("loop", (event) => this.looped(event.action));
  }

  update(delta: number) {
    this.mixer?.update(delta);
  }

  dispose() {
    this.mixer?.stopAllAction();
  }

  setClips(clips: ModelStageClips | undefined) {
    this.sequence = [];
    this.step = 0;
    this.oneShot = null;
    this.pool = null;
    if (isClipPool(clips)) {
      const pool = new ClipPool(clips, (name) => this.has(name), this.random);
      if (pool.playable) {
        this.pool = pool;
        this.startPoolTurn(SEQUENCE_FADE_SECONDS);
      }
      return;
    }
    const names =
      clips === undefined ? this.clips.slice(0, 1).map((clip) => clip.name) : [clips].flat();
    this.sequence = names.filter((name) => this.has(name));
    this.playStep();
  }

  playOnce(name: string) {
    const action = this.play(name, true, SEQUENCE_FADE_SECONDS);
    if (action) this.oneShot = action;
  }

  private has(name: string): boolean {
    return this.clips.some((clip) => clip.name === name);
  }

  private startPoolTurn(fade: number) {
    if (!this.pool) return;
    const turn = this.pool.next();
    this.loopsLeft = this.pool.alternates ? turn.loops : Number.POSITIVE_INFINITY;
    this.play(turn.name, false, fade);
  }

  private playStep() {
    const name = this.sequence[this.step];
    if (name !== undefined)
      this.play(name, this.step < this.sequence.length - 1, SEQUENCE_FADE_SECONDS);
  }

  private play(name: string, once: boolean, fade: number): THREE.AnimationAction | null {
    const clip = this.clips.find((candidate) => candidate.name === name);
    if (!this.mixer || !clip) return null;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    if (this.current && this.current !== action) {
      this.current.fadeOut(fade);
      action.fadeIn(fade);
    }
    action.play();
    this.current = action;
    this.onPlay();
    return action;
  }

  private looped(action: THREE.AnimationAction) {
    if (!this.pool || action !== this.current) return;
    this.loopsLeft -= 1;
    if (this.loopsLeft <= 0) this.startPoolTurn(this.pool.crossfade);
  }

  private finished(action: THREE.AnimationAction) {
    if (action === this.oneShot) {
      this.oneShot = null;
      if (this.pool) this.startPoolTurn(SEQUENCE_FADE_SECONDS);
      else this.playStep();
    } else if (action === this.current && this.step < this.sequence.length - 1) {
      this.step += 1;
      this.playStep();
    }
  }
}
