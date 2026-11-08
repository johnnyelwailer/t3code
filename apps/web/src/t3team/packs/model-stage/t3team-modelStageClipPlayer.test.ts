import * as THREE from "three";
import { describe, expect, it } from "vite-plus/test";

import { ModelStageClipPlayer } from "./t3team-modelStageClipPlayer";
import { ClipPool } from "./t3team-modelStagePool";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const clip = (name: string, seconds: number) =>
  new THREE.AnimationClip(name, seconds, [
    new THREE.NumberKeyframeTrack(".position[x]", [0, seconds], [0, 1]),
  ]);

const everything = () => true;

describe("ClipPool", () => {
  it("never repeats a clip back to back, and keeps loops inside the range", () => {
    const pool = new ClipPool({ pool: ["a", "b", "c"], loops: [1, 3] }, everything, seeded(7));
    let previous = "";
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const turn = pool.next();
      expect(turn.name).not.toBe(previous);
      expect(turn.loops).toBeGreaterThanOrEqual(1);
      expect(turn.loops).toBeLessThanOrEqual(3);
      previous = turn.name;
      seen.add(turn.name);
    }
    expect(seen.size).toBe(3);
  });

  it("drops names the model lacks and duplicates, and loops a lone clip", () => {
    const pool = new ClipPool({ pool: ["a", "a", "ghost"] }, (name) => name !== "ghost", seeded(1));
    expect(pool.alternates).toBe(false);
    expect(pool.next().name).toBe("a");
    expect(pool.next().name).toBe("a");
    expect(new ClipPool({ pool: ["ghost"] }, () => false, seeded(1)).playable).toBe(false);
  });
});

describe("ModelStageClipPlayer pool", () => {
  function playerWith(names: ReadonlyArray<string>, seconds = 2) {
    const player = new ModelStageClipPlayer(() => {}, seeded(3));
    player.bind(
      new THREE.Object3D(),
      names.map((name) => clip(name, seconds)),
    );
    return player;
  }

  it("takes turns between pool clips after their loops, without repeating", () => {
    const player = playerWith(["a", "b", "c"]);
    player.setClips({ pool: ["a", "b", "c"], loops: [1, 2] });
    const order: string[] = [];
    for (let t = 0; t < 40; t += 0.1) {
      player.update(0.1);
      const name = player.currentName;
      if (name !== null && order.at(-1) !== name) order.push(name);
    }
    expect(order.length).toBeGreaterThan(4);
    expect(order.every((name, i) => i === 0 || name !== order[i - 1])).toBe(true);
    expect(new Set(order).size).toBe(3);
  });

  it("holds each clip for its loops: at least one, at most two", () => {
    const player = playerWith(["a", "b"]);
    player.setClips({ pool: ["a", "b"], loops: [1, 2] });
    const dwell: number[] = [];
    let since = 0;
    let name = player.currentName;
    for (let t = 0; t < 60; t += 0.05) {
      player.update(0.05);
      since += 0.05;
      if (player.currentName !== name) {
        dwell.push(since);
        since = 0;
        name = player.currentName;
      }
    }
    expect(dwell.length).toBeGreaterThan(5);
    for (const seconds of dwell) {
      expect(seconds).toBeGreaterThanOrEqual(2 - 0.1);
      expect(seconds).toBeLessThanOrEqual(4 + 0.1);
    }
  });

  it("falls back to the first clip for a pool of unknown names, and plays lists as before", () => {
    const player = playerWith(["a", "b"]);
    player.setClips({ pool: ["nope"] });
    expect(player.currentName).toBeNull();
    player.setClips(["a", "b"]);
    expect(player.currentName).toBe("a");
    player.update(2.5);
    expect(player.currentName).toBe("b");
  });
});
