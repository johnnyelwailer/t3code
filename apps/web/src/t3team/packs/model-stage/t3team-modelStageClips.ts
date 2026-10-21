/**
 * The clip sequencer of `ModelStageScene`: a list plays in order (each once) and loops the last;
 * a one-shot plays over it and hands back to the step it interrupted. Clips cross-fade.
 */
import * as THREE from "three";

/**
 * A track with one keyframe has hung the page inside three's interpolant (seen with cross-faded
 * one-shots); pad it to two equal keys spanning the clip, so a trimmed asset can never do that.
 */
export function padSingleKeyTracks(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    if (track.times.length !== 1) continue;
    const t0 = track.times[0] ?? 0;
    const width = track.values.length;
    const values = new (track.values.constructor as Float32ArrayConstructor)(width * 2);
    values.set(track.values, 0);
    values.set(track.values, width);
    track.times = new Float32Array([t0, Math.max(t0 + 1e-3, clip.duration)]);
    track.values = values;
  }
}

/**
 * How far (world units) any clip lifts the root bone above its rest pose: a jump's root motion.
 * The stage grows its canvas upward by this much so a hop is not cropped by the framing.
 */
export function clipRise(root: THREE.Object3D, clips: ReadonlyArray<THREE.AnimationClip>): number {
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let rise = 0;
  for (const track of clips.flatMap((clip) => clip.tracks)) {
    const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const node = THREE.PropertyBinding.findNode(root, nodeName) as THREE.Object3D | null;
    if (propertyName !== "position" || !node?.parent || (node.parent as THREE.Bone).isBone)
      continue;
    const restY = node.getWorldPosition(point).y;
    for (let i = 0; i + 2 < track.values.length; i += 3) {
      point.fromArray(track.values, i);
      rise = Math.max(rise, node.parent.localToWorld(point).y - restY);
    }
  }
  return rise;
}

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
    for (const clip of clips) padSingleKeyTracks(clip);
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
