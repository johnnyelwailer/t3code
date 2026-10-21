import * as Schema from "effect/Schema";

/**
 * The desktop shell's power state, as the renderer reads it to scale decorative rendering (the
 * `ModelStage` tiers). `lowPower` is the closest Electron signal to an OS low-power mode: a
 * thermal state of `serious`/`critical`, or a CPU speed limit under half.
 */
export const DesktopPowerState = Schema.Struct({
  onBattery: Schema.Boolean,
  lowPower: Schema.Boolean,
});
export type DesktopPowerState = typeof DesktopPowerState.Type;
