/**
 * Flight + ground shadow for `ModelStageScene`: a soft elliptical blob under the feet, a Y lift
 * with a sine bob, and a light procedural flap on shoulder bones when the rig has them. No Meshy
 * clip required — packs opt in through `ModelStageFlight`.
 */
import * as THREE from "three";
import type { ModelStageFlight } from "@t3team/pack-ui/contract";

const DEFAULT_BOB_AMP = 0.045;
const DEFAULT_BOB_HZ = 1.5;
const FLAP_HZ = 3.2;
const FLAP_AMP = 0.38; // radians

function shadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, "rgba(0,0,0,0.55)");
  gradient.addColorStop(0.4, "rgba(0,0,0,0.28)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type Shoulder = { bone: THREE.Bone; baseZ: number; sign: number };

/** Owns the shadow mesh and applies lift/bob/flap each frame after the mixer. */
export class ModelStageMotion {
  private readonly root = new THREE.Group();
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private flight: ModelStageFlight | null = null;
  private showShadow = true;
  private height = 1;
  private groundY = 0;
  private shoulders: Shoulder[] = [];
  private elapsed = 0;
  private readonly texture: THREE.CanvasTexture;

  constructor(private readonly scene: THREE.Scene) {
    this.texture = shadowTexture();
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = -1;
    this.scene.add(this.shadow);
    this.scene.add(this.root);
  }

  /** Parent the cloned model under the motion root; frame using the returned sphere. */
  attach(model: THREE.Object3D): THREE.Sphere {
    this.root.clear();
    this.root.position.set(0, 0, 0);
    this.root.add(model);
    model.updateMatrixWorld(true);
    model.traverse((object) => (object as THREE.SkinnedMesh).skeleton?.update());
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    this.height = Math.max(sphere.radius * 2, 0.01);
    this.groundY = sphere.center.y - sphere.radius;
    const span = sphere.radius * 1.35;
    this.shadow.scale.set(span, span * 0.55, 1);
    this.shadow.position.set(sphere.center.x, this.groundY + 0.002, sphere.center.z);
    this.shoulders = [];
    model.traverse((object) => {
      if (!(object as THREE.Bone).isBone) return;
      const name = object.name;
      if (name === "LeftShoulder" || name === "LeftArm") {
        this.shoulders.push({ bone: object as THREE.Bone, baseZ: object.rotation.z, sign: 1 });
      } else if (name === "RightShoulder" || name === "RightArm") {
        this.shoulders.push({ bone: object as THREE.Bone, baseZ: object.rotation.z, sign: -1 });
      }
    });
    // Prefer shoulders over arms when both exist.
    const shouldersOnly = this.shoulders.filter((s) => /Shoulder$/.test(s.bone.name));
    if (shouldersOnly.length >= 2) this.shoulders = shouldersOnly;
    this.apply(0);
    return sphere;
  }

  setFlight(flight: ModelStageFlight | null | undefined) {
    this.flight = flight && flight.lift > 0 ? flight : null;
  }

  setGroundShadow(enabled: boolean) {
    this.showShadow = enabled;
    this.shadow.visible = enabled;
  }

  /** True while bobbing or flapping, so the scene keeps requesting frames. */
  active(): boolean {
    return this.flight !== null;
  }

  /** Apply lift/bob/flap for `delta` seconds. Call after `mixer.update`. */
  apply(delta: number) {
    this.elapsed += delta;
    const flight = this.flight;
    const liftFrac = flight?.lift ?? 0;
    const bobAmp = (flight?.bobAmp ?? DEFAULT_BOB_AMP) * this.height;
    const bobHz = flight?.bobHz ?? DEFAULT_BOB_HZ;
    const bob = flight ? Math.sin(this.elapsed * Math.PI * 2 * bobHz) * bobAmp : 0;
    this.root.position.y = liftFrac * this.height + bob;

    const airborne = liftFrac > 0.02;
    const shadowOpacity = !this.showShadow
      ? 0
      : airborne
        ? Math.max(0, 0.7 * (1 - Math.min(1, liftFrac / 0.28)))
        : 0.7;
    this.shadowMat.opacity = shadowOpacity;
    this.shadow.visible = this.showShadow && shadowOpacity > 0.02;
    // Soften the blob a little more while rising (reads as distance).
    const shrink = airborne ? 1 - Math.min(0.35, liftFrac * 0.6) : 1;
    this.shadow.scale.x = this.height * 0.78 * shrink;
    this.shadow.scale.y = this.height * 0.42 * shrink;

    const flapOn = Boolean(flight && (flight.wingFlap ?? true) && airborne);
    if (flapOn) {
      const flap = Math.sin(this.elapsed * Math.PI * 2 * FLAP_HZ) * FLAP_AMP;
      for (const { bone, baseZ, sign } of this.shoulders) {
        bone.rotation.z = baseZ + flap * sign;
      }
    }
  }

  dispose() {
    this.scene.remove(this.shadow);
    this.scene.remove(this.root);
    this.shadow.geometry.dispose();
    this.shadowMat.dispose();
    this.texture.dispose();
  }
}
