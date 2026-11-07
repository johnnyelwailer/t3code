/**
 * Imperative half of `ModelStage`: one WebGL renderer, lighting, clip sequencer, frame loop.
 * Loaded only through the lazy canvas, so three.js stays out of every other chunk.
 * Soft ground shadow + flight bob live in `t3team-modelStageMotion.ts` (no real-time shadows).
 */
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import type { ModelStageClips, ModelStageFlight } from "@t3team/pack-ui/contract";

import { lightStage, toLambert } from "./t3team-modelStageAssets";
import { ModelStageClipPlayer } from "./t3team-modelStageClipPlayer";
import { ModelStageFrameLoop } from "./t3team-modelStageFrameLoop";
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
  private readonly player = new ModelStageClipPlayer(() => this.loop.wake());
  private readonly loop: ModelStageFrameLoop;
  private probe: number[] | null;
  private disposed = false;
  private bounds: THREE.Sphere | null = null;

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
    this.loop = new ModelStageFrameLoop(
      (delta) => this.renderFrame(delta),
      () => this.animating(),
      frameIntervalMs(tier),
    );
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
    this.frameCamera();
    this.player.bind(model, gltf.animations);
    this.renderFrame(0);
  }

  setSize(size: number) {
    this.renderer.setSize(size, size, false);
    this.renderFrame(0);
  }

  setFlight(flight: ModelStageFlight | null | undefined) {
    this.motion.setFlight(flight);
    this.frameCamera();
    if (this.motion.active()) this.loop.wake();
    else this.renderFrame(0);
  }

  setGroundShadow(enabled: boolean) {
    this.motion.setGroundShadow(enabled);
    this.renderFrame(0);
  }

  /**
   * A list plays in order, each once, and loops the last; a pool takes turns between its clips.
   * Absent: the first clip, looped.
   */
  setClips(clips: ModelStageClips | undefined) {
    this.player.setClips(clips);
  }

  playOnce(name: string) {
    this.player.playOnce(name);
  }

  setRunning(running: boolean) {
    this.loop.setRunning(running);
  }

  dispose() {
    this.disposed = true;
    this.loop.setRunning(false);
    this.player.dispose();
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
    return this.player.running || this.motion.active();
  }

  private renderFrame(delta: number) {
    if (this.disposed) return;
    const start = performance.now();
    this.player.update(delta);
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
