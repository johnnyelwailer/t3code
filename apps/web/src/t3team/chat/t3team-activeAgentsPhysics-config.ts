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
