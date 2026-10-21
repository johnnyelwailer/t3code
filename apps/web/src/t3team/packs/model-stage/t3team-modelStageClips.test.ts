import * as THREE from "three";
import { describe, expect, it } from "vite-plus/test";

import { padSingleKeyTracks } from "./t3team-modelStageClips";

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
