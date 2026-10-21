/**
 * The renderer's view of the power monitor: whether the machine runs on battery and whether it is
 * throttling (thermal state `serious`/`critical`, or a CPU speed limit under half). Decorative
 * rendering (`ModelStage`) reads it to step down; nothing functional depends on it.
 *
 * One `get` method plus a push on every change, so a stage does not poll.
 */
import { DesktopPowerState } from "@t3tools/contracts";
import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as ElectronPowerMonitor from "../../electron/ElectronPowerMonitor.ts";
import { GET_POWER_STATE_CHANNEL, POWER_STATE_CHANGED_CHANNEL } from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

/** Pure, for the test: which raw power-monitor readings count as low power. */
export function isLowPower(
  thermal: ElectronPowerMonitor.ElectronThermalState,
  speedLimitPercent: number,
): boolean {
  return thermal === "serious" || thermal === "critical" || speedLimitPercent < 50;
}

export const installPowerState = Effect.fn("desktop.ipc.installPowerState")(function* () {
  const ipc = yield* DesktopIpc.DesktopIpc;
  const power = yield* ElectronPowerMonitor.ElectronPowerMonitor;
  let thermal: ElectronPowerMonitor.ElectronThermalState = yield* power.getCurrentThermalState;
  let speedLimit = 100;
  let onBattery = yield* power.isOnBatteryPower;
  const read = (): DesktopPowerState => ({ onBattery, lowPower: isLowPower(thermal, speedLimit) });
  let last = read();
  const update = (change: () => void) => {
    change();
    const state = read();
    if (state.onBattery === last.onBattery && state.lowPower === last.lowPower) return;
    last = state;
    for (const window of Electron.BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(POWER_STATE_CHANGED_CHANNEL, state);
    }
  };
  yield* ipc.handle(
    DesktopIpc.makeIpcMethod({
      channel: GET_POWER_STATE_CHANNEL,
      payload: Schema.Void,
      result: DesktopPowerState,
      handler: () => Effect.sync(read),
    }),
  );
  yield* power.onSimpleEvent("on-ac", () => update(() => (onBattery = false)));
  yield* power.onSimpleEvent("on-battery", () => update(() => (onBattery = true)));
  yield* power.onThermalStateChange((state) => update(() => (thermal = state)));
  yield* power.onSpeedLimitChange((limit) => update(() => (speedLimit = limit)));
});
