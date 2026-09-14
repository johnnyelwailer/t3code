import { describe, expect, it } from "vite-plus/test";

import { createSBendPhysics, type SBendInput, type SBendOut } from "./t3team-activeAgentsPhysics";

function fresh() {
  const physics = createSBendPhysics();
  const out: SBendOut = { poses: [], scales: [], snapIndex: -1 };
  return { physics, out };
}

const HOMES = [
  { x: 40, y: 50 },
  { x: 56, y: 50 },
  { x: 72, y: 50 },
];

/** Run `frames` at ~16.7ms spacing until the motion is settled. */
function settle(
  physics: ReturnType<typeof createSBendPhysics>,
  out: SBendOut,
  cursor: SBendInput["cursor"],
  frames = 160,
) {
  let t = 0;
  for (let i = 0; i < frames; i++) {
    t += 16.7;
    physics.stepFrame(t, { cursor, homes: HOMES }, out);
  }
  return out;
}

describe("createSBendPhysics", () => {
  it("leaves everything at home when the cursor is far away", () => {
    const { physics, out } = fresh();
    physics.stepFrame(16.7, { cursor: { x: 500, y: 400, active: false }, homes: HOMES }, out);
    for (const pose of out.poses) {
      expect(Math.abs(pose.y)).toBeLessThan(0.01);
    }
  });

  it("moves dots on the Y axis only — the x-pitch is sacred", () => {
    const { physics, out } = fresh();
    // Cursor above the row, centered on the middle dot: the row bends.
    settle(physics, out, { x: 56, y: -20, active: true });
    expect(out.poses.every((pose) => Math.abs(pose.x) < 0.01)).toBe(true);
    expect(out.poses.some((pose) => Math.abs(pose.y) > 0.5)).toBe(true);
  });

  it("bends into an S around the cursor's x: one side up, the other down", () => {
    const { physics, out } = fresh();
    settle(physics, out, { x: 56, y: -20, active: true });
    // The dots left of the cursor's x and the dots right of it must bend in
    // OPPOSITE directions — that IS the S.
    expect(out.poses[0]!.y).toBeLessThan(-0.25);
    expect(out.poses[2]!.y).toBeGreaterThan(0.25);
  });

  it("captures dead on a dot's home: that dot snaps to zero displacement", () => {
    const { physics, out } = fresh();
    // Cursor parked on dot 1's home (within the 12px snap radius) while the
    // row would otherwise bend around it.
    settle(physics, out, { x: 56, y: 48, active: true });
    expect(out.snapIndex).toBe(1);
    expect(Math.abs(out.poses[1]!.y)).toBeLessThan(0.1);
    expect(out.scales[1]).toBe("1.45"); // the locked dot grows
  });

  it("grows only ONE dot: the single grower", () => {
    const { physics, out } = fresh();
    settle(physics, out, { x: 56, y: 48, active: true });
    const grown = out.scales.filter((scale) => scale === "1.45");
    expect(grown.length).toBe(1);
  });

  it("settles back to home when the cursor leaves", () => {
    const { physics, out } = fresh();
    settle(physics, out, { x: 56, y: -20, active: true });
    // Pointer left the row: every dot eases back to its home.
    settle(physics, out, { x: 56, y: -20, active: false }, 400);
    expect(out.poses.every((pose) => Math.abs(pose.y) < 0.5)).toBe(true);
    expect(out.snapIndex).toBe(-1);
  });
});
