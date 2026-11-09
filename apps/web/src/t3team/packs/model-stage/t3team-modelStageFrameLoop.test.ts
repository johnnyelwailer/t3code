import { describe, expect, it } from "vite-plus/test";

import { type FrameScheduler, ModelStageFrameLoop } from "./t3team-modelStageFrameLoop";

function fakeFrames() {
  let nextId = 1;
  const pending = new Map<number, (now: number) => void>();
  const scheduler: FrameScheduler = {
    request: (callback) => {
      pending.set(nextId, callback);
      return nextId++;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  };
  const advance = (now: number) => {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback(now);
  };
  return { scheduler, pending, advance };
}

describe("ModelStageFrameLoop", () => {
  it("keeps one chain when a wake arrives during a frame", () => {
    const frames = fakeFrames();
    let steps = 0;
    const loop: ModelStageFrameLoop = new ModelStageFrameLoop(
      () => {
        steps += 1;
        loop.wake();
      },
      () => true,
      0,
      frames.scheduler,
    );
    loop.setRunning(true);
    for (let i = 1; i <= 50; i++) {
      expect(frames.pending.size).toBe(1);
      frames.advance(i * 16);
    }
    expect(frames.pending.size).toBe(1);
    expect(steps).toBe(50);
  });

  it("steps at the tier's interval, with a capped delta", () => {
    const frames = fakeFrames();
    const deltas: number[] = [];
    const loop = new ModelStageFrameLoop(
      (delta) => deltas.push(delta),
      () => true,
      100,
      frames.scheduler,
    );
    loop.setRunning(true);
    frames.advance(1000);
    frames.advance(1016);
    frames.advance(1050);
    frames.advance(1099);
    frames.advance(5000);
    expect(deltas).toEqual([0, 0.099, 0.1]);
  });

  it("stops when nothing moves or the stage is hidden, and wakes again on demand", () => {
    const frames = fakeFrames();
    let moving = true;
    let steps = 0;
    const loop = new ModelStageFrameLoop(
      () => (steps += 1),
      () => moving,
      0,
      frames.scheduler,
    );
    loop.setRunning(true);
    frames.advance(10);
    moving = false;
    frames.advance(20);
    expect(frames.pending.size).toBe(0);
    loop.wake();
    expect(frames.pending.size).toBe(1);
    loop.setRunning(false);
    expect(frames.pending.size).toBe(0);
    loop.wake();
    expect(frames.pending.size).toBe(0);
    expect(steps).toBe(2);
  });
});
