/**
 * Imperative half of `ModelStage`: one WebGL renderer, lighting, clip sequencer, frame loop.
 * Loaded only through the lazy canvas, so three.js stays out of every other chunk.
 * Soft ground shadow + flight bob live in `t3team-modelStageMotion.ts` (no real-time shadows).
 */
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { ModelStageFlight } from "@t3team/pack-ui/contract";

import { lightStage, toLambert } from "./t3team-modelStageAssets";
import { ModelStageMotion } from "./t3team-modelStageMotion";
import { modelStageProbed, recordModelStageProbe } from "./t3team-modelStageSignals";
import { frameIntervalMs, probeMeanMs } from "./t3team-modelStageTier";

export type WebGLTier = "full" | "low";
export { loadModel } from "./t3team-modelStageAssets";

export class ModelStageScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  private readonly environment: THREE.Texture | null;
  private readonly motion: ModelStageMotion;
  private mixer: THREE.AnimationMixer | null = null;
  private clips: ReadonlyArray<THREE.AnimationClip> = [];
  private sequence: ReadonlyArray<string> = [];
  private step = 0;
  private current: THREE.AnimationAction | null = null;
  private oneShot: THREE.AnimationAction | null = null;
  private running = false;
  private frame = 0;
  private last = 0;
  private probe: number[] | null;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly tier: WebGLTier,
    size: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
      premultipliedAlpha: true,
    });
    this.renderer.setPixelRatio(tier === "full" ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = false;
    this.environment = lightStage(this.scene, this.renderer, tier);
    this.motion = new ModelStageMotion(this.scene);
    this.probe = modelStageProbed(tier) ? null : [];
  }

  get webgl(): THREE.WebGLRenderer {
    return this.renderer;
  }

  setModel(gltf: GLTF, yawDegrees: number) {
    const model = cloneSkinned(gltf.scene);
    if (this.tier === "low") {
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(toLambert)
          : toLambert(mesh.material);
      });
    }
    model.rotation.y = THREE.MathUtils.degToRad(yawDegrees);
    const { center, radius } = this.motion.attach(model);
    // Headroom for hover + a little floor under the feet so the ground shadow is not clipped.
    const pad = radius * 0.45;
    const floor = radius * 0.2;
    this.camera.position.set(
      center.x,
      center.y + radius * 0.05 + pad * 0.45 - floor * 0.2,
      center.z + radius * 2.75,
    );
    this.camera.lookAt(center.x, center.y + pad * 0.2 - floor * 0.55, center.z);
    this.clips = gltf.animations;
    if (this.clips.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      this.mixer.addEventListener("finished", (event) => this.finished(event.action));
    }
    this.renderFrame(0);
  }

  setSize(size: number) {
    this.renderer.setSize(size, size, false);
    this.renderFrame(0);
  }

  setFlight(flight: ModelStageFlight | null | undefined) {
    this.motion.setFlight(flight);
    if (this.motion.active()) this.wake();
    else this.renderFrame(0);
  }

  setGroundShadow(enabled: boolean) {
    this.motion.setGroundShadow(enabled);
    this.renderFrame(0);
  }

  /** A list plays in order, each once, and loops the last. Absent: the first clip, looped. */
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

  setRunning(running: boolean) {
    this.running = running;
    if (running) this.wake();
    else {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.last = 0;
    }
  }

  dispose() {
    this.disposed = true;
    this.setRunning(false);
    this.mixer?.stopAllAction();
    this.motion.dispose();
    this.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private playStep() {
    const name = this.sequence[this.step];
    if (name !== undefined) this.play(name, this.step < this.sequence.length - 1);
  }

  private play(name: string, once: boolean): THREE.AnimationAction | null {
    const clip = this.clips.find((candidate) => candidate.name === name);
    if (!this.mixer || !clip) return null;
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

  private animating(): boolean {
    return (this.current?.isRunning() ?? false) || this.motion.active();
  }

  private wake() {
    if (this.running && this.frame === 0 && !this.disposed) {
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (!this.running || this.disposed) return;
    if (this.last === 0 || now - this.last >= frameIntervalMs(this.tier) - 1) {
      const delta = this.last === 0 ? 0 : Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.renderFrame(delta);
    }
    if (this.animating()) this.frame = requestAnimationFrame(this.tick);
    else this.last = 0;
  };

  private renderFrame(delta: number) {
    if (this.disposed) return;
    const start = performance.now();
    this.mixer?.update(delta);
    this.motion.apply(delta);
    this.renderer.render(this.scene, this.camera);
    if (this.probe === null) return;
    this.renderer.getContext().finish();
    this.probe.push(performance.now() - start);
    const mean = probeMeanMs(this.probe);
    if (mean !== null) {
      this.probe = null;
      recordModelStageProbe(this.tier, mean);
    }
  }
}
