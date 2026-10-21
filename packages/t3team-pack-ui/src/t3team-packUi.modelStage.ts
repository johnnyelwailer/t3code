/**
 * `pack-ui:1` model stage: a host-rendered, real-time 3D model (glTF) with a power-aware ladder of
 * cheaper forms. A pack ships the asset and its pre-rendered fallbacks; the host owns the renderer
 * (three.js, loaded only when a tier needs it), the lighting, the frame budget and every decision
 * about when to drop a tier. A pack never imports a renderer of its own.
 *
 * Tiers, richest first:
 *   • `full`    — the asset's own (PBR) materials, room environment + key + rim light, up to 60 fps;
 *   • `low`     — the same model with diffuse-only (Lambert) materials, 30 fps, DPR 1, no shadows;
 *   • `minimal` — the pack's pre-rendered loop (video or sprite sheet), no WebGL at all;
 *   • `still`   — the pack's still image. Always the form under `prefers-reduced-motion`.
 *
 * The host picks the tier from reduced motion, battery level, the desktop's power state and a
 * first-frames probe; `quality` caps it (it never raises a tier the host has ruled out). It always
 * pauses while the stage is hidden or off screen, and renders only on demand while nothing plays.
 *
 * Optional flight lifts the model with a bob (and a light procedural wing flap on the shoulder
 * bones when present); a soft elliptical ground shadow sits under the feet and fades while airborne.
 */

/** A tier the host can render, richest first. */
export type ModelStageTier = "full" | "low" | "minimal" | "still";

/** What a pack (or the user) asks for: `auto` lets the host decide; a tier is a ceiling. */
export type ModelStageQuality = "auto" | ModelStageTier;

/**
 * A pre-rendered loop of the model, shown at the `minimal` tier. Transparent backgrounds
 * (WebM VP9 with alpha, or a PNG/WebP sprite sheet) sit on any theme.
 */
export type ModelStageLoop =
  | { readonly kind: "video"; readonly src: string }
  | {
      readonly kind: "sprite";
      readonly src: string;
      /** Frames across and down the sheet; frames are read left to right, top to bottom. */
      readonly columns: number;
      readonly rows: number;
      /** Frames actually used, when the last row is not full. */
      readonly frames?: number;
      readonly fps: number;
    };

/** A clip to play, by its glTF animation name. A list plays in order, then loops the last one. */
export type ModelStageClips = string | ReadonlyArray<string>;

/**
 * Fake flight without a dedicated clip: lift the model, bob it, and (when the rig has shoulder
 * bones) flap the arms a little. `lift` is a fraction of the model's height; 0 is grounded.
 */
export interface ModelStageFlight {
  readonly lift: number;
  /** Vertical bob amplitude as a fraction of height. Default 0.045. */
  readonly bobAmp?: number;
  /** Bob frequency in Hz. Default 1.5. */
  readonly bobHz?: number;
  /** Procedural shoulder flap while airborne. Default true when `lift` > 0. */
  readonly wingFlap?: boolean;
}

export interface PackModelStageProps {
  /** The glTF binary (`.glb`). KTX2 textures and meshopt geometry are supported. */
  readonly src: string;
  /** Always required: the `still` tier, the loading poster and the no-WebGL form. */
  readonly still: string;
  /** The `minimal` tier. Without one, `minimal` falls back to the still. */
  readonly loop?: ModelStageLoop;
  /** Which animation to play; switching it cross-fades. Absent: the first clip, looped. */
  readonly clips?: ModelStageClips;
  /** Played once over the current clips (e.g. a reaction to a click), then they resume. */
  readonly oneShot?: { readonly clip: string; readonly key: number } | null;
  /** Square edge, in CSS pixels. The stage never resizes its parent. */
  readonly size: number;
  /** A ceiling on the tier; the host may still choose a cheaper one. Default `auto`. */
  readonly quality?: ModelStageQuality;
  /** Accessible name. Decorative stages (the usual case) pass nothing and are `aria-hidden`. */
  readonly label?: string;
  /** Yaw of the model, in degrees, so a pack can show a three-quarter view. Default 0. */
  readonly yaw?: number;
  /** Lift + bob (+ optional wing flap). Absent or `lift: 0` keeps the model grounded. */
  readonly flight?: ModelStageFlight | null;
  /**
   * Soft elliptical ground shadow under the feet. Default true. Fades out while airborne and is
   * hidden under reduced motion's still when the pack also opts out of flight.
   */
  readonly groundShadow?: boolean;
  /** Fired with the tier actually rendered, for a pack that adapts its own chrome. */
  readonly onTierChange?: (tier: ModelStageTier) => void;
}
