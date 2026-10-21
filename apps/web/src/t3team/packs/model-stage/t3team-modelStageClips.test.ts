import * as THREE from "three";
import { describe, expect, it } from "vite-plus/test";

import { clipRise, padSingleKeyTracks } from "./t3team-modelStageClips";

describe("padSingleKeyTracks", () => {
  it("gives a one-key track a second, equal key, so the mixer can evaluate it", () => {
    const one = new THREE.VectorKeyframeTrack("Hips.position", [0], [1, 2, 3]);
    const two = new THREE.VectorKeyframeTrack("Head.position", [0, 2], [0, 0, 0, 1, 1, 1]);
    const clip = new THREE.AnimationClip("trimmed", 2, [one, two]);
    padSingleKeyTracks(clip);
    expect(Array.from(clip.tracks[0]!.times)).toEqual([0, 2]);
    expect(Array.from(clip.tracks[0]!.values)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(clip.tracks[1]!.times.length).toBe(2);
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    mixer.clipAction(clip).play();
    expect(() => mixer.update(5)).not.toThrow();
  });
});

describe("clipRise", () => {
  it("measures the root bone's highest lift in world units, ignoring child bones", () => {
    const root = new THREE.Group();
    root.scale.setScalar(0.5);
    const hips = Object.assign(new THREE.Bone(), { name: "Hips" });
    const head = Object.assign(new THREE.Bone(), { name: "Head" });
    hips.position.set(0, 2, 0);
    hips.add(head);
    root.add(hips);
    const jump = new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 2, 0, 0, 6, 0]);
    const nod = new THREE.VectorKeyframeTrack("Head.position", [0, 1], [0, 0, 0, 0, 50, 0]);
    expect(clipRise(root, [new THREE.AnimationClip("hop", 1, [jump, nod])])).toBeCloseTo(2);
    const sink = new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 2, 0, 0, 1, 0]);
    expect(clipRise(root, [new THREE.AnimationClip("sit", 1, [sink])])).toBe(0);
  });
});
