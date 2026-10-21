/**
 * The clip sequencer of `ModelStageScene`: a list plays in order (each once) and loops the last;
 * a one-shot plays over it and hands back to the step it interrupted. Clips cross-fade.
 */
import * as THREE from "three";

export class ModelStageClips {
  private readonly mixer: THREE.AnimationMixer;
  private sequence: ReadonlyArray<string> = [];
  private step = 0;
  private current: THREE.AnimationAction | null = null;
  private oneShot: THREE.AnimationAction | null = null;

  constructor(
    root: THREE.Object3D,
    private readonly clips: ReadonlyArray<THREE.AnimationClip>,
    private readonly wake: () => void,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    this.mixer.addEventListener("finished", (event) => this.finished(event.action));
  }

  update(delta: number) {
    this.mixer.update(delta);
  }

  /** Absent: the first clip, looped. Unknown names are skipped. */
  setClips(clips: string | ReadonlyArray<string> | undefined) {
    const names =
      clips === undefined ? this.clips.slice(0, 1).map((clip) => clip.name) : [clips].flat();
    this.sequence = names.filter((name) => this.clips.some((clip) => clip.name === name));
    this.step = 0;
    this.oneShot = null;
    this.playStep();
  }

  playOnce(name: string) {
    const action = this.play(name, true);
    if (action) this.oneShot = action;
  }

  animating(): boolean {
    return this.current?.isRunning() ?? false;
  }

  stop() {
    this.mixer.stopAllAction();
  }

  private playStep() {
    const name = this.sequence[this.step];
    if (name !== undefined) this.play(name, this.step < this.sequence.length - 1);
  }

  private play(name: string, once: boolean): THREE.AnimationAction | null {
    const clip = this.clips.find((candidate) => candidate.name === name);
    if (!clip) return null;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    if (this.current && this.current !== action) {
      this.current.fadeOut(0.3);
      action.fadeIn(0.3);
    }
    action.play();
    this.current = action;
    this.wake();
    return action;
  }

  private finished(action: THREE.AnimationAction) {
    if (action === this.oneShot) {
      this.oneShot = null;
      this.playStep();
    } else if (action === this.current && this.step < this.sequence.length - 1) {
      this.step += 1;
      this.playStep();
    }
  }
}
