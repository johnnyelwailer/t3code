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
 * Optional look-at turns the head toward the pointer; optional interaction pokes and drags it.
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

/**
 * Head (and neck) turn toward the pointer, layered over whatever clip plays. Angles are clamped
 * and eased; the host skips it under reduced motion and at the non-WebGL tiers.
 */
export interface ModelStageLookAt {
  /** Bones that turn, root-most first, each with its share of the turn. Default neck + Head. */
  readonly bones?: ReadonlyArray<{ readonly name: string; readonly weight: number }>;
  /** Largest turn left/right and up/down, in degrees. Defaults 50 and 25. */
  readonly maxYawDeg?: number;
  readonly maxPitchDeg?: number;
  /** Pointer distance (CSS px) at which the turn is nearly full. Default 320. */
  readonly reachPx?: number;
}

/**
 * Makes the stage a control: focusable, named, poked by click/tap/Enter/Space, and optionally
 * picked up and dropped within its surroundings (it stays inside the nearest ancestor that is
 * comfortably larger than the stage). A drop lets it fall back to its resting height.
 */
export interface ModelStageInteraction {
  readonly label: string;
  readonly onPoke?: () => void;
  readonly draggable?: boolean;
  /** Fired when the stage is picked up (`true`) and once it has landed again (`false`). */
  readonly onHeldChange?: (held: boolean) => void;
  /** Any other key while focused (e.g. a pack's own shortcut). */
  readonly onKey?: (key: string) => void;
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
  /** Pointer tracking for the head. Absent: the model ignores the pointer. */
  readonly lookAt?: ModelStageLookAt | null;
  /** Click, keyboard and drag. Absent: a decorative, `aria-hidden` stage. */
  readonly interaction?: ModelStageInteraction | null;
  /** Fired with the tier actually rendered, for a pack that adapts its own chrome. */
  readonly onTierChange?: (tier: ModelStageTier) => void;
}
