/**
 * Look-at for `ModelStageScene`: turns the neck/head bones toward the pointer, layered over the
 * playing clip. Each frame the bones go back to their saved pose before the mixer runs, so a bone
 * the clip does not animate never accumulates the turn; after the mixer, the eased turn is applied
 * about the world's up and right axes, whatever the rig's own bone axes are.
 */
import * as THREE from "three";
import type { ModelStageLookAt as LookAtOptions } from "@t3team/pack-ui/contract";

import {
  DEFAULT_LOOK_AT_LIMITS,
  lookAtAngles,
  smoothToward,
  type LookAtLimits,
} from "./t3team-modelStageMath";
import type { StagePointer } from "./t3team-modelStagePointer";

const DEFAULT_BONES = [
  { name: "neck", weight: 0.35 },
  { name: "Head", weight: 0.65 },
];
const SETTLED = 1e-3;

type Turned = { bone: THREE.Object3D; weight: number; base: THREE.Quaternion };

const worldQ = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const axis = new THREE.Vector3();

export class ModelStageLookAt {
  private model: THREE.Object3D | null = null;
  private options: LookAtOptions | null = null;
  private pointer: StagePointer | null = null;
  private bones: Turned[] = [];
  private limits: LookAtLimits = DEFAULT_LOOK_AT_LIMITS;
  private yaw = 0;
  private pitch = 0;
  private target = { yaw: 0, pitch: 0 };

  setModel(model: THREE.Object3D) {
    this.model = model;
    this.resolve();
  }

  configure(options: LookAtOptions | null, pointer: StagePointer | null) {
    this.restore();
    this.options = options;
    this.pointer = pointer;
    this.limits = {
      maxYawDeg: options?.maxYawDeg ?? DEFAULT_LOOK_AT_LIMITS.maxYawDeg,
      maxPitchDeg: options?.maxPitchDeg ?? DEFAULT_LOOK_AT_LIMITS.maxPitchDeg,
      reachPx: options?.reachPx ?? DEFAULT_LOOK_AT_LIMITS.reachPx,
    };
    this.resolve();
  }

  /** Before the mixer: back to the saved pose. */
  restore() {
    for (const { bone, base } of this.bones) bone.quaternion.copy(base);
  }

  /** After the mixer: ease toward the pointer and turn the bones. */
  apply(dt: number) {
    if (this.bones.length === 0) return;
    const pointer = this.pointer;
    this.target = pointer?.present
      ? lookAtAngles(pointer.dx, pointer.dy, this.limits)
      : { yaw: 0, pitch: 0 };
    this.yaw = smoothToward(this.yaw, this.target.yaw, dt);
    this.pitch = smoothToward(this.pitch, this.target.pitch, dt);
    for (const { bone, weight } of this.bones) {
      bone.updateWorldMatrix(true, false);
      bone.getWorldQuaternion(worldQ).invert();
      axis.set(0, 1, 0).applyQuaternion(worldQ);
      bone.quaternion.multiply(turn.setFromAxisAngle(axis, this.yaw * weight));
      axis.set(1, 0, 0).applyQuaternion(worldQ);
      bone.quaternion.multiply(turn.setFromAxisAngle(axis, this.pitch * weight));
    }
  }

  /** Still easing toward the pointer: keep the frame loop going. */
  active(): boolean {
    if (this.bones.length === 0) return false;
    return (
      Math.abs(this.target.yaw - this.yaw) > SETTLED ||
      Math.abs(this.target.pitch - this.pitch) > SETTLED
    );
  }

  private resolve() {
    this.bones = [];
    if (!this.model || !this.options) return;
    for (const { name, weight } of this.options.bones ?? DEFAULT_BONES) {
      const bone = this.model.getObjectByName(name);
      if (bone) this.bones.push({ bone, weight, base: bone.quaternion.clone() });
    }
  }
}
