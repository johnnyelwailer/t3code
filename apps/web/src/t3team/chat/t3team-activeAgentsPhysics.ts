/**
 * S-BEND + SNAP — the status-row dot proximity physics (GHE #201 follow-up).
 *
 * Pure, allocation-lean and DOM-free so it is reusable from anywhere a row
 * of dots reacts to a pointer (and so it is unit-testable without a page):
 *
 *   const physics = createSBendPhysics(defaultConfig);
 *   const out = physics.stepFrame(now, { cursor, homes }, out);
 *   out.poses[i] -> transform, out.scales[i] -> the `scale` property value
 *
 * MODEL
 * -----
 * The cursor is a THREAT the dots avoid, mainly on the Y axis:
 *
 *   BEND   — while the cursor is near the row, the row parts around the
 *            cursor's x: one side eases down, the other eases up. This is
 *            the "S along the horizontal axis". X-pitch is sacred (dots
 *            only ever move vertically), so neighbors can never approach
 *            each other — they diverge — and nothing is ever pulled TOWARD
 *            the cursor.
 *   SNAP   — when the cursor sits on a dot's home, that ONE dot locks
 *            exactly at its home and grows (1.45). Capture is dead
 *            (instant, no spring) and the hand-off is immediate: the
 *            moment the cursor comes within SNAP of a DIFFERENT home,
 *            that dot takes over. Between dots the incumbent holds until
 *            RELEASE (no boundary chatter).
 *   SETTLE — after release a dot's only target is its home until the
 *            cursor is REJOIN px away, so the dot, its home and where the
 *            cursor left it all stay in agreement.
 *   ANTICIPATE — near-cursor, non-locked dots shrink to SHRINK before any
 *            of them may grow.
 *
 * Everything is bounded (a few px) and eased with exponential smoothing —
 * no forces, no velocity terms, nothing that can bounce or overshoot.
 */

export interface SBendConfig {
  /** Max vertical bend of a dot (px). Small on purpose. */
  readonly bendAmplitude: number;
  /** Tanh knee (px): how fast the two sides of the row separate. */
  readonly bendKnee: number;
  /** Horizontal distance (px) over which the bend fades to zero. */
  readonly bendRadius: number;
  /** Vertical distance (px) over which the bend fades to zero. */
  readonly verticalRadius: number;
  /** How fast the bend center chases the cursor (seconds, exponential tau). */
  readonly headTau: number;
  /** Cursor within this of a dot's home triggers the snap (px). */
  readonly snap: number;
  /** A lock holds until the cursor is past this, when between dots (px). */
  readonly release: number;
  /** After release, the dot stays at home until the cursor is this far (px). */
  readonly rejoin: number;
  /** Anticipation radius around the cursor (px). */
  readonly shrinkRadius: number;
  /** Anticipation scale (the dot only GROWS when it locks in). */
  readonly shrink: number;
  /** Scale of the locked dot. */
  readonly grow: number;
  /** Base pose-easing time-constant (seconds). */
  readonly poseTau: number;
  /** Extra easing per dot position in the row (keeps the bend soft). */
  readonly poseTauStep: number;
}

export const defaultSBendConfig: SBendConfig = {
  bendAmplitude: 8,
  bendKnee: 14,
  bendRadius: 64,
  verticalRadius: 100,
  headTau: 0.04,
  snap: 12,
  release: 22,
  rejoin: 48,
  shrinkRadius: 60,
  shrink: 0.82,
  grow: 1.45,
  poseTau: 0.1,
  poseTauStep: 0.04,
};

export type Point = Readonly<{ readonly x: number; readonly y: number }>;

export interface SBendInput {
  /** Cursor in row space; `active` false when the pointer is away. */
  readonly cursor: Point & { readonly active: boolean };
  /** Each dot's UNTRANSFORMED home center (row space), same order as poses. */
  readonly homes: readonly Point[];
}

export interface SBendOut {
  /**
   * Per-dot pose. `x` is always 0 in this model (x-pitch is sacred);
   * `snapped`/`settling` are the state flags of the same dot.
   * The caller passes the same object back each frame (zero-allocation
   * hot path), so the fields are mutable.
   */
  poses: Array<{ x: number; y: number; snapped: boolean; settling: boolean }>;
  /** Per-dot value for the CSS `scale` property ("1" = normal). */
  scales: string[];
  /** The single locked dot index, or -1. */
  snapIndex: number;
}

interface InternalPose {
  x: number;
  y: number;
  snapped: boolean;
  wasSnapped: boolean;
  settling: boolean;
}

/**
 * Owns the per-dot simulation state and the smoothed bend center.
 * `stepFrame` is pure-with-respect-to-inputs: given the same inputs and
 * `dt` it always returns the same poses — the caller supplies time.
 */
export interface SBendPhysics {
  readonly config: SBendConfig;
  stepFrame(now: number, input: SBendInput, out: SBendOut): SBendOut;
  reset(): void;
}

export function createSBendPhysics(config: SBendConfig = defaultSBendConfig): SBendPhysics {
  let head: { x: number; y: number } | null = null;
  let last = 0;
  let poses: InternalPose[] = [];

  const reset = () => {
    head = null;
    last = 0;
    poses = [];
  };

  const stepFrame = (now: number, input: SBendInput, out: SBendOut): SBendOut => {
    const dt = Math.min(0.032, Math.max(0.001, last === 0 ? 0.016 : (now - last) / 1000));
    last = now;
    const { cursor, homes } = input;

    while (poses.length < homes.length) {
      poses.push({ x: 0, y: 0, snapped: false, wasSnapped: false, settling: false });
    }
    poses = poses.slice(0, homes.length);

    // Bend center: eases toward the live cursor; relaxes to the first
    // home when the cursor leaves, so the wave flows out.
    const anchor = homes[0] ?? { x: 0, y: 0 };
    const target = cursor.active ? cursor : anchor;
    if (!head) head = { x: target.x, y: target.y };
    const hk = 1 - Math.exp(-dt / config.headTau);
    head.x += (target.x - head.x) * hk;
    head.y += (target.y - head.y) * hk;

    // --- snap selection: exactly one grower, ever.
    let snapIdx = -1;
    if (cursor.active) {
      for (let i = 0; i < homes.length; i++) {
        const home = homes[i]!;
        const dist = Math.hypot(home.x - cursor.x, home.y - cursor.y);
        if (
          dist < config.snap &&
          (snapIdx === -1 ||
            dist < Math.hypot(homes[snapIdx]!.x - cursor.x, homes[snapIdx]!.y - cursor.y))
        ) {
          snapIdx = i;
        }
      }
      const prev = poses.findIndex((p) => p.snapped);
      if (prev !== -1 && snapIdx !== -1 && snapIdx !== prev) {
        // Two homes under the cursor: the CLOSER home wins immediately
        // (the hand-off). The incumbent holds only while it is still the
        // closest home — otherwise a stale lock would sit on the wrong
        // dot while the cursor is on another home.
        const prevDist = Math.hypot(homes[prev]!.x - cursor.x, homes[prev]!.y - cursor.y);
        const candDist = Math.hypot(homes[snapIdx]!.x - cursor.x, homes[snapIdx]!.y - cursor.y);
        if (prevDist <= candDist) snapIdx = prev;
      } else if (prev !== -1 && snapIdx === -1) {
        const prevDist = Math.hypot(homes[prev]!.x - cursor.x, homes[prev]!.y - cursor.y);
        if (prevDist <= config.release) snapIdx = prev; // between dots: hold
      }
    }
    poses.forEach((pose, i) => {
      pose.snapped = i === snapIdx;
    });

    // One stable chirality per frame (from the ROW's height, not per dot),
    // so the bend can't flutter at row height.
    const rowAway = anchor.y >= head.y ? 1 : -1;

    for (let i = 0; i < homes.length; i++) {
      const pose = poses[i];
      const home = homes[i];
      if (!pose || !home) continue;
      const cursorDist = Math.hypot(home.x - cursor.x, home.y - cursor.y);

      // Release: the dot belongs to its HOME until the cursor is far.
      if (pose.wasSnapped && !pose.snapped) pose.settling = true;
      pose.wasSnapped = pose.snapped;
      if (pose.settling && cursorDist > config.rejoin) pose.settling = false;

      let ty = 0;
      if (!pose.snapped && !pose.settling && cursor.active) {
        const dx = home.x - head.x;
        const vDist = Math.abs(home.y - head.y);
        const proximity = Math.max(0, Math.min(1, 1 - vDist / config.verticalRadius));
        const falloff = Math.max(0, 1 - Math.abs(dx) / config.bendRadius);
        ty =
          rowAway *
          config.bendAmplitude *
          Math.tanh(dx / config.bendKnee) *
          falloff *
          falloff *
          proximity;
      }

      // Dead capture: locked dots sit EXACTLY at home, instantly.
      if (pose.snapped) {
        pose.x = 0;
        pose.y = 0;
      } else {
        const k = 1 - Math.exp(-dt / (config.poseTau + i * config.poseTauStep));
        pose.x = 0;
        pose.y += (ty - pose.y) * k;
      }

      const near =
        cursor.active &&
        !pose.snapped &&
        Math.hypot(home.x - head.x, home.y - head.y) < config.shrinkRadius;
      const scale = pose.snapped ? config.grow : near ? config.shrink : 1;

      out.poses[i] = { x: pose.x, y: pose.y, snapped: pose.snapped, settling: pose.settling };
      out.scales[i] = String(scale);
    }
    out.snapIndex = snapIdx;
    return out;
  };

  return { config, stepFrame, reset };
}
