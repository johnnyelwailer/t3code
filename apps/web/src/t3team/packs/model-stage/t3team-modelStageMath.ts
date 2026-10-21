/**
 * Pure geometry for `ModelStage` interactivity (no three.js, no DOM): the clamped look-at angles,
 * frame-rate independent easing, and keeping a dragged stage inside its surroundings.
 */
export interface LookAtLimits {
  readonly maxYawDeg: number;
  readonly maxPitchDeg: number;
  readonly reachPx: number;
}

export const DEFAULT_LOOK_AT_LIMITS: LookAtLimits = {
  maxYawDeg: 50,
  maxPitchDeg: 25,
  reachPx: 320,
};

const DEG = Math.PI / 180;

/**
 * Yaw/pitch (radians) toward a pointer `dx`/`dy` CSS px from the head. Positive yaw turns toward
 * screen right, positive pitch looks down. `tanh` saturates softly, so the result never passes the
 * limits however far the pointer is.
 */
export function lookAtAngles(
  dx: number,
  dy: number,
  limits: LookAtLimits = DEFAULT_LOOK_AT_LIMITS,
): { yaw: number; pitch: number } {
  const reach = Math.max(limits.reachPx, 1);
  const yaw = limits.maxYawDeg * DEG * Math.tanh(dx / reach);
  const pitch = limits.maxPitchDeg * DEG * Math.tanh(dy / reach);
  return { yaw: yaw === 0 ? 0 : yaw, pitch: pitch === 0 ? 0 : pitch };
}

/** Exponential ease of `current` toward `target` at `speed` per second, independent of frame rate. */
export function smoothToward(current: number, target: number, dt: number, speed = 8): number {
  if (dt <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The drag offset (from the stage's resting place) clamped so the stage stays inside `bounds`.
 * `rest` is the stage's box at offset 0. A bounds box smaller than the stage pins it at rest.
 */
export function clampDragOffset(
  offset: { x: number; y: number },
  rest: Box,
  bounds: Box,
): { x: number; y: number } {
  const minX = bounds.left - rest.left;
  const maxX = bounds.left + bounds.width - (rest.left + rest.width);
  const minY = bounds.top - rest.top;
  const maxY = bounds.top + bounds.height - (rest.top + rest.height);
  const clamp = (v: number, lo: number, hi: number) =>
    lo > hi ? 0 : Math.min(hi, Math.max(lo, v));
  return { x: clamp(offset.x, minX, maxX), y: clamp(offset.y, minY, maxY) };
}
