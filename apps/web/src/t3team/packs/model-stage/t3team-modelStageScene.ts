/**
 * Imperative half of `ModelStage`: one WebGL renderer, lighting, the frame loop. Loaded only
 * through the lazy canvas, so three.js stays out of every other chunk. Clips live in
 * `t3team-modelStageClips.ts`, flight + ground shadow in `t3team-modelStageMotion.ts`, pointer
 * look-at in `t3team-modelStageLookAt.ts`. No real-time shadows.
 */
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { ModelStageFlight, ModelStageLookAt as LookAtOptions } from "@t3team/pack-ui/contract";

import { lightStage, toLambert } from "./t3team-modelStageAssets";
import { ModelStageClips } from "./t3team-modelStageClips";
import { ModelStageLookAt } from "./t3team-modelStageLookAt";
import { ModelStageMotion } from "./t3team-modelStageMotion";
import type { StagePointer } from "./t3team-modelStagePointer";
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
  private readonly lookAt = new ModelStageLookAt();
  private clips: ModelStageClips | null = null;
  private bounds: THREE.Sphere | null = null;
  private pointer: StagePointer | null = null;
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
    this.bounds = this.motion.attach(model);
    this.lookAt.setModel(model);
    this.frameCamera();
    if (gltf.animations.length > 0) {
      this.clips = new ModelStageClips(model, gltf.animations, () => this.wake());
    }
    this.renderFrame(0);
  }

  setSize(size: number) {
    this.renderer.setSize(size, size, false);
    this.renderFrame(0);
  }

  setFlight(flight: ModelStageFlight | null | undefined) {
    this.motion.setFlight(flight);
    this.frameCamera();
    if (this.motion.active()) this.wake();
    else this.renderFrame(0);
  }

  setGroundShadow(enabled: boolean) {
    this.motion.setGroundShadow(enabled);
    this.renderFrame(0);
  }

  setLookAt(options: LookAtOptions | null, pointer: StagePointer | null) {
    if (this.pointer) this.pointer.onMove = null;
    this.pointer = options ? pointer : null;
    if (this.pointer) this.pointer.onMove = () => this.wake();
    this.lookAt.configure(options, this.pointer);
    this.wake();
  }

  setClips(clips: string | ReadonlyArray<string> | undefined) {
    this.clips?.setClips(clips);
  }

  playOnce(name: string) {
    this.clips?.playOnce(name);
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
    if (this.pointer) this.pointer.onMove = null;
    this.clips?.stop();
    this.motion.dispose();
    this.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** Frames the rest pose plus the hover's reach, with a little floor for the ground shadow. */
  private frameCamera() {
    if (!this.bounds) return;
    const { center, radius } = this.bounds;
    const up = this.motion.reach();
    const half = radius * 0.78 + up / 2;
    const distance = half / Math.tan(THREE.MathUtils.degToRad(16));
    const y = center.y - radius * 0.08 + up / 2;
    this.camera.position.set(center.x, y + radius * 0.06, center.z + distance);
    this.camera.lookAt(center.x, y, center.z);
  }

  private animating(): boolean {
    return (this.clips?.animating() ?? false) || this.motion.active() || this.lookAt.active();
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
    this.lookAt.restore();
    this.clips?.update(delta);
    this.motion.apply(delta);
    this.lookAt.apply(delta);
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
